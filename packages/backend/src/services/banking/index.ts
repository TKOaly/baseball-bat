import {
  BankAccount,
  BankTransaction,
  DbBankTransaction,
  DbBankStatement,
  BankStatement,
} from '@bbat/common/types';
import { PgClient } from '@/db';
import sql from 'sql-template-strings';
import * as paymentsService from '@/services/payments/definitions';
import { cents } from '@bbat/common/currency';
import { formatPayment } from '../payments';
import { assignTransactionsToPaymentByReferenceNumber, createBankAccount, createBankStatement, getAccountStatements, getAccountTransactions, getBankAccount, getBankAccounts, getBankStatement, getBankStatementTransactions, getTransaction, getTransactionRegistrations, getTransactionsWithoutRegistration } from './definitions';
import { ModuleDeps } from '@/app';
import { createPaymentEventFromTransaction } from '../payments/definitions';

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
  date: tx.value_time,
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

export default ({ pg, bus }: ModuleDeps) => {
  bus.register(createBankAccount, async (account) => {
    await pg.any(sql`
      INSERT INTO bank_accounts (iban, name)
      VALUES (${account.iban.replace(/\s+/g, '').toUpperCase()}, ${
        account.name
      })
    `);
  });

  bus.register(getBankAccount, async (iban) => {
      return pg.one<BankAccount>(
        sql`SELECT * FROM bank_accounts WHERE iban = ${iban}`,
      );
  });

  bus.register(getBankAccounts, async () => {
      return pg.any<BankAccount>(sql`SELECT * FROM bank_accounts`);
  });

  bus.register(createBankStatement, async (details) => {
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
        const existing = await pg.any<DbBankTransaction>(
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
        }

        if (!transaction) {
          throw new Error('Could not create transaction');
        }

        await pg.one(sql`
        INSERT INTO bank_statement_transaction_mapping (bank_statement_id, bank_transaction_id)
        VALUES (
          ${statement.id},
          ${transaction.id}
        )
      `);

        await bus.exec(createPaymentEventFromTransaction, {
          transaction: {
            ...transaction,
            account: details.accountIban,
          },
          amount: null,
          paymentId: null,
        });

        return transaction;
      }),
    );

    return {
      statement: formatBankStatement(statement),
      transactions: transactions,
    };
  });
  
  bus.register(assignTransactionsToPaymentByReferenceNumber, async ({ referenceNumber, paymentId }) => {
    const dbTransactions = await pg.any<DbBankTransaction>(sql`
      SELECT * FROM bank_transactions WHERE reference = ${referenceNumber}
    `);

    const transactions = dbTransactions.map(formatBankTransaction);

    await Promise.all(
      transactions.map(transaction => bus.exec(createPaymentEventFromTransaction, {
        transaction,
        paymentId,
        amount: null,
      })),
    );
  });
  
  bus.register(getTransactionsWithoutRegistration, async () => {
    const transactions = await pg.any<DbBankTransaction>(sql`
      SELECT t.*
      FROM bank_transactions t
      LEFT JOIN payment_event_transaction_mapping petm ON t.id = petm.bank_transaction_id
      WHERE petm.bank_transaction_id IS NULL
    `);

    return transactions.map(formatBankTransaction);
  });
  
  bus.register(getAccountTransactions, async (iban) => {
    const transactions = await pg.any<DbBankTransaction>(sql`
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
      WHERE account = ${iban}
    `);

    return transactions.map(formatBankTransaction);
  });
  
  bus.register(getTransaction, async (id) => {
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
  });

  bus.register(getTransactionRegistrations, async (id: string) => {
    const rows = await pg.any<{ payment_event_id: string }>(sql`
      SELECT m.payment_event_id
      FROM payment_event_transaction_mapping m
      WHERE m.bank_transaction_id = ${id}
    `);

    return (await Promise.all(
      rows
        .map(row => bus.exec(paymentsService.getPaymentEvent, row.payment_event_id))
    ))
        .flatMap(event => event ? [event] : [])
  });

  bus.register(getAccountStatements, async (iban: string) => {
    const statements = await pg.any<DbBankStatement>(sql`
      SELECT * FROM bank_statements WHERE account = ${iban}
    `);

    return statements.map(formatBankStatement);
  });

  bus.register(getBankStatement, async (id: string) => {
    const statement = await pg.one<DbBankStatement>(sql`
      SELECT * FROM bank_statements WHERE id = ${id} LIMIT 1
    `);

    return statement && formatBankStatement(statement);
  });

  bus.register(getBankStatementTransactions, async (id: string) => {
    const transactions = await pg.any<DbBankTransaction>(sql`
      SELECT
        bt.*,
        TO_JSON(p.*) AS payment
      FROM bank_statement_transaction_mapping bstm
      JOIN bank_transactions bt ON bt.id = bstm.bank_transaction_id
      LEFT JOIN payment_event_transaction_mapping petm ON petm.bank_transaction_id = bt.id
      LEFT JOIN payment_events pe ON pe.id = petm.payment_event_id
      LEFT JOIN payments p ON p.id = pe.payment_id
      WHERE bstm.bank_statement_id = ${id}
    `);

    return transactions.map(formatBankTransaction);
  });
}