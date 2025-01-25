import {
  BankAccount,
  DbBankTransaction,
  DbBankStatement,
  BankStatement,
} from '@bbat/common/types';
import * as audit from '@/modules/audit/definitions';
import * as consumers from 'stream/consumers';
import { sql } from '@/db/template';
import * as paymentsService from '@/modules/payments/definitions';
import * as jobs from '@/modules/jobs/definitions';
import { cents } from '@bbat/common/currency';
import iface, {
  onTransaction,
  getBankStatement,
  createBankStatement,
  createBankTransaction,
} from './definitions';
import routes from './api';
import { createModule } from '@/module';
import { parseCamtStatement } from '@bbat/common/camt-parser';
import { formatBankTransaction, transactionQuery } from './query';

const formatBankStatement = (
  stmt: DbBankStatement,
): Omit<BankStatement, 'transactions'> => ({
  id: stmt.id,
  accountIban: stmt.account,
  generatedAt: stmt.generated_at,
  openingBalance: {
    date: stmt.opening_balance_date,
    amount: cents(stmt.opening_balance),
  },
  closingBalance: {
    date: stmt.closing_balance_date,
    amount: cents(stmt.closing_balance),
  },
});

export default createModule({
  name: 'banking',

  routes,

  async setup({ bus, minio }) {
    bus.provide(iface, {
      async createBankAccount(account, { pg }) {
        const result = await pg.one<BankAccount>(sql`
          INSERT INTO bank_accounts (iban, name)
          VALUES (${account.iban.replace(/\s+/g, '').toUpperCase()}, ${
            account.name
          })
          RETURNING *
        `);

        if (!result) {
          throw new Error('Failed to create bank account!');
        }

        return result;
      },

      async getBankAccount(iban, { pg }) {
        return pg.one<BankAccount>(
          sql`SELECT * FROM bank_accounts WHERE iban = ${iban}`,
        );
      },

      async getBankAccounts(_, { pg }) {
        return pg.many<BankAccount>(sql`SELECT * FROM bank_accounts`);
      },

      async createBankStatement(details, { pg }, bus) {
        const statement = await pg.one<DbBankStatement>(sql`
          INSERT INTO bank_statements (id, account, opening_balance_date, opening_balance, closing_balance_date, closing_balance, generated_at, imported_at, start_date, end_date)
          VALUES (
            ${details.id},
            ${details.accountIban},
            ${details.openingBalance.date},
            ${details.openingBalance.amount.value},
            ${details.closingBalance.date},
            ${details.closingBalance.amount.value},
            ${details.generatedAt},
            ${new Date()},
            ${details.openingBalance.date},
            ${details.closingBalance.date}
          )
          RETURNING *
        `);

        if (!statement) {
          throw new Error('Could not create bank statement');
        }

        const transactions = await Promise.all(
          (details.transactions ?? []).map(tx =>
            bus.exec(createBankTransaction, {
              ...tx,
              bankStatementId: statement.id,
            }),
          ),
        );

        await bus.exec(audit.logEvent, {
          type: 'bank-statement.create',
          details: {
            id: statement.id,
            start: statement.opening_balance_date,
            end: statement.closing_balance_date,
          },
          links: [
            {
              type: 'statement',
              label: statement.id,
              target: {
                type: 'bank-statement',
                id: statement.id,
              },
            },
          ],
        });

        return {
          statement: formatBankStatement(statement),
          transactions,
        };
      },

      async createBankTransaction(tx, { pg }, bus) {
        const statement = await bus.exec(getBankStatement, tx.bankStatementId);

        if (!statement) {
          throw new Error('No such bank statement!');
        }

        const existing = await pg.many<DbBankTransaction>(
          sql`SELECT  * FROM bank_transactions WHERE id = ${tx.id}`,
        );

        let transaction;

        if (existing.length > 0) {
          transaction = formatBankTransaction(existing[0]);
        } else {
          const created = await pg.one<DbBankTransaction>(sql`
            INSERT INTO bank_transactions (account, id, amount, type, other_party_name, other_party_account, value_time, reference, message)
            VALUES (
              ${statement.accountIban},
              ${tx.id},
              ${tx.amount.value},
              ${tx.type},
              ${tx.otherParty.name},
              ${tx.otherParty.account},
              ${tx.date},
              ${tx.reference},
              ${tx.message}
            )
            RETURNING *
          `);

          if (!created) {
            throw new Error('Could not create bank transaction');
          }

          transaction = formatBankTransaction(created);

          await bus.emit(onTransaction, transaction);
        }

        if (!transaction) {
          throw new Error('Could not create transaction');
        }

        await pg.do(sql`
          INSERT INTO bank_statement_transaction_mapping (bank_statement_id, bank_transaction_id)
          VALUES (
            ${statement.id},
            ${transaction.id}
          )
        `);

        return transaction;
      },

      async getTransactionsWithoutRegistration(_, { pg }) {
        const transactions = await pg.many<DbBankTransaction>(sql`
          SELECT t.*
          FROM bank_transactions t
          LEFT JOIN payment_event_transaction_mapping petm ON t.id = petm.bank_transaction_id
          WHERE petm.bank_transaction_id IS NULL
        `);

        return transactions.map(formatBankTransaction);
      },

      async getAccountTransactions({ iban, cursor, limit, sort }, { pg }) {
        return transactionQuery.execute(pg, {
          where: sql`account = ${iban}`,
          cursor,
          limit,
          order: sort ? [[sort.column, sort.dir]] : undefined,
        });
      },

      async getTransactionsByReference(reference, { pg }) {
        const transactions = await pg.many<DbBankTransaction>(sql`
          SELECT
            bt.*,
            (
              SELECT ARRAY_AGG(TO_JSONB(p.*) || JSONB_BUILD_OBJECT('events', (SELECT ARRAY_AGG(TO_JSON(payment_events.*)) FROM payment_events WHERE payment_id = p.id)))
              FROM payment_event_transaction_mapping petm
              INNER JOIN payment_events pe ON pe.id = petm.payment_event_id
              INNER JOIN payments p ON p.id = pe.payment_id
              WHERE petm.bank_transaction_id = bt.id
            ) AS payments
          FROM bank_transactions bt
          WHERE reference = ${reference}
        `);

        return transactions.map(formatBankTransaction);
      },

      async getTransaction(id, { pg }) {
        const transaction = await pg.one<DbBankTransaction>(sql`
            SELECT
              bt.*,
              TO_JSON(p.*) AS payment
            FROM bank_transactions bt
            LEFT JOIN payment_event_transaction_mapping petm ON petm.bank_transaction_id = bt.id
            LEFT JOIN payment_events pe ON pe.id = petm.payment_event_id
            LEFT JOIN payments p ON p.id = pe.payment_id
            WHERE bt.id = ${id}
          `);

        if (!transaction) {
          return null;
        }

        return formatBankTransaction(transaction);
      },

      async getTransactionRegistrations(id, { pg }, bus) {
        const rows = await pg.many<{ payment_event_id: string }>(sql`
          SELECT m.payment_event_id
          FROM payment_event_transaction_mapping m
          WHERE m.bank_transaction_id = ${id}
        `);

        return (
          await Promise.all(
            rows.map(row =>
              bus.exec(paymentsService.getPaymentEvent, row.payment_event_id),
            ),
          )
        ).flatMap(event => (event ? [event] : []));
      },

      async getAccountStatements(iban, { pg }) {
        const statements = await pg.many<DbBankStatement>(sql`
          SELECT * FROM bank_statements WHERE account = ${iban}
        `);

        return statements.map(formatBankStatement);
      },

      async getBankStatement(id, { pg }) {
        const statement = await pg.one<DbBankStatement>(sql`
          SELECT * FROM bank_statements WHERE id = ${id} LIMIT 1
        `);

        return statement && formatBankStatement(statement);
      },

      async getBankStatementTransactions({ id, cursor, limit, sort }, { pg }) {
        return transactionQuery.execute(pg, {
          where: sql`id IN (SELECT bank_transaction_id FROM bank_statement_transaction_mapping WHERE bank_statement_id = ${id})`,
          cursor,
          limit,
          order: sort ? [[sort.column, sort.dir]] : undefined,
        });
      },
    });

    bus.provideNamed(jobs.executor, 'import-statement', {
      async execute({ data, id }, _, bus) {
        const { bucket, key } = data as { bucket: string; key: string };

        const stream = await minio.getObject(bucket, key);
        const content = await consumers.text(stream);
        const statement = await parseCamtStatement(content);

        await bus.exec(jobs.update, {
          id,
          title: `Import CAMT statement ${statement.id}`,
        });

        const existing = await bus.exec(getBankStatement, statement.id);

        if (existing) {
          throw new Error('Bank statement already imported!');
        }

        const bankStatement = await bus.exec(createBankStatement, {
          id: statement.id,
          accountIban: statement.account.iban,
          generatedAt: statement.creationDateTime,
          openingBalance: statement.openingBalance,
          closingBalance: statement.closingBalance,
        });

        let i = 0;
        for (const entry of statement.entries) {
          i++;

          await bus.exec(createBankTransaction, {
            bankStatementId: bankStatement.statement.id,
            id: entry.id,
            amount: entry.amount,
            date: entry.valueDate,
            type: entry.type,
            otherParty: entry.otherParty,
            message: entry.message,
            reference: entry.reference,
          });

          await bus.exec(jobs.update, {
            id,
            progress: i / statement.entries.length,
          });
        }

        return { bankStatementId: bankStatement.statement.id };
      },
    });
  },
});
