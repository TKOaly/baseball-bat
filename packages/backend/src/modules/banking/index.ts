import {
  BankAccount,
  BankTransaction,
  DbBankTransaction,
  DbBankStatement,
  BankStatement,
} from '@bbat/common/types';
import sql from 'sql-template-strings';
import * as paymentsService from '@/modules/payments/definitions';
import { cents } from '@bbat/common/currency';
import { formatPayment } from '../payments';
import iface, { onTransaction } from './definitions';
import routes from './api';
import { parseISO } from 'date-fns';
import { createModule } from '@/module';

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

const formatBankTransaction = (tx: DbBankTransaction): BankTransaction => ({
  id: tx.id,
  amount: cents(tx.amount),
  date:
    typeof tx.value_time === 'string' ? parseISO(tx.value_time) : tx.value_time,
  type: tx.type,
  account: tx.account,
  otherParty: {
    name: tx.other_party_name,
    account: tx.other_party_account,
  },
  message: tx.message,
  reference: tx.reference,
  payments: (tx.payments ?? []).map(formatPayment),
});

export default createModule({
  name: 'banking',

  routes,

  async setup({ bus }) {
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
        const dates = details.transactions.map(tx => tx.date).sort();

        const start_date = dates[0];
        const end_date = dates[dates.length - 1];

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
            ${start_date},
            ${end_date}
          )
          RETURNING *
        `);

        if (!statement) {
          throw new Error('Could not create bank statement');
        }

        const transactions = await Promise.all(
          details.transactions.map(async tx => {
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
                  ${details.accountIban},
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
          }),
        );

        return {
          statement: formatBankStatement(statement),
          transactions: transactions,
        };
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

      async getAccountTransactions(iban, { pg }) {
        const transactions = await pg.many<DbBankTransaction>(sql`
          SELECT
            bt.*,
            (
              SELECT ARRAY_AGG(TO_JSONB(ps.*)) FROM (
                SELECT
                  p.*,
                  s.balance,
                  s.status,
                  s.payer,
                  (SELECT payer_id FROM payment_debt_mappings pdm JOIN debt d ON pdm.debt_id = d.id WHERE pdm.payment_id = p.id LIMIT 1) AS payer_id,
                  (SELECT ARRAY_AGG(TO_JSON(payment_events.*)) FROM payment_events WHERE payment_id = p.id) AS events,
                  COALESCE(s.updated_at, p.created_at) AS updated_at
                FROM payment_event_transaction_mapping petm
                JOIN payment_events pe ON pe.id = petm.payment_event_id
                JOIN payments p ON pe.payment_id = p.id
                JOIN payment_statuses s ON s.id = p.id
                WHERE petm.bank_transaction_id = bt.id
              ) ps
            ) AS payments
          FROM bank_transactions bt
          WHERE account = ${iban}
        `);

        return transactions.map(formatBankTransaction);
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

      async getBankStatementTransactions(id, { pg }) {
        const transactions = await pg.many<DbBankTransaction>(sql`
          SELECT
            bt.*,
            (
              SELECT ARRAY_AGG(TO_JSONB(ps.*)) FROM (
                SELECT
                  p.*,
                  s.balance,
                  s.status,
                  s.payer,
                  (SELECT payer_id FROM payment_debt_mappings pdm JOIN debt d ON pdm.debt_id = d.id WHERE pdm.payment_id = p.id LIMIT 1) AS payer_id,
                  (SELECT ARRAY_AGG(TO_JSON(payment_events.*)) FROM payment_events WHERE payment_id = p.id) AS events,
                  COALESCE(s.updated_at, p.created_at) AS updated_at
                FROM payment_event_transaction_mapping petm
                JOIN payment_events pe ON pe.id = petm.payment_event_id
                JOIN payments p ON pe.payment_id = p.id
                JOIN payment_statuses s ON s.id = p.id
                WHERE petm.bank_transaction_id = bt.id
              ) ps
            ) AS payments
          FROM bank_statement_transaction_mapping bstm
          JOIN bank_transactions bt ON bt.id = bstm.bank_transaction_id
          WHERE bstm.bank_statement_id = ${id}
        `);

        return transactions.map(formatBankTransaction);
      },
    });
  },
});
