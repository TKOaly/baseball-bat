import { Inject, Service } from 'typedi';
import { BankAccount, BankTransaction, DbBankTransaction, DbBankStatement, BankStatement } from '../../common/types';
import { PgClient } from '../db';
import sql from 'sql-template-strings';
import { cents } from '../../common/currency';
import { PaymentService } from './payements';

const formatBankStatement = (stmt: DbBankStatement): Omit<BankStatement, 'transactions'> => ({
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
  payment: tx.payment,
});

@Service()
export class BankingService {
  @Inject(() => PgClient)
  pg: PgClient;

  @Inject(() => PaymentService)
  paymentService: PaymentService;

  async createBankAccount(account: BankAccount) {
    await this.pg.any(sql`
      INSERT INTO bank_accounts (iban, name)
      VALUES (${account.iban.replace(/\s+/g, '').toUpperCase()}, ${account.name})
    `);
  }

  async getBankAccounts() {
    return this.pg.any<BankAccount>(sql`SELECT * FROM bank_accounts`);
  }

  async getBankAccount(iban: string) {
    return this.pg.one<BankAccount>(sql`SELECT * FROM bank_accounts WHERE iban = ${iban}`);
  }

  async createBankStatement(details: BankStatement) {
    const dates = details.transactions.map(tx => tx.date).sort();

    const start_date = dates[0];
    const end_date = dates[dates.length - 1];

    const statement = await this.pg.one<DbBankStatement>(sql`
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

    const transactions = await Promise.all(details.transactions.map(async (tx) => {
      const existing = await this.pg.any<DbBankTransaction>(sql`SELECT  * FROM bank_transactions WHERE id = ${tx.id}`);

      let transaction;

      if (existing.length > 0) {
        transaction = formatBankTransaction(existing[0]);
      } else {
        const created = await this.pg.one<DbBankTransaction>(sql`
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

      await this.pg.one(sql`
        INSERT INTO bank_statement_transaction_mapping (bank_statement_id, bank_transaction_id)
        VALUES (
          ${statement.id},
          ${transaction.id}
        )
      `);

      await this.paymentService.createPaymentEventFromTransaction({
        ...transaction,
        account: details.accountIban,
      });

      return transaction;
    }));

    return {
      statement: formatBankStatement(statement),
      transactions: transactions,
    };
  }

  async assignTransactionsToPaymentByReferenceNumber(paymentId: string, referenceNumber: string) {
    const dbTransactions = await this.pg.any<DbBankTransaction>(sql`
      SELECT * FROM bank_transactions WHERE reference = ${referenceNumber}
    `);

    const transactions = dbTransactions.map(formatBankTransaction);

    await Promise.all(
      transactions
        .map((transaction) => this.paymentService.createPaymentEventFromTransaction(transaction, paymentId))
    );
  }

  async getTransactionsWithoutRegistration() {
    const transactions = await this.pg.any<DbBankTransaction>(sql`
      SELECT t.*
      FROM bank_transactions t
      LEFT JOIN payment_event_transaction_mapping petm ON t.id = petm.bank_transaction_id
      WHERE petm.bank_transaction_id IS NULL
    `);

    return transactions.map(formatBankTransaction);
  }

  async getAccountTransactions(iban: string) {
    const transactions = await this.pg.any<DbBankTransaction>(sql`
      SELECT
        bt.*,
        TO_JSON(p.*) AS payment
      FROM bank_transactions bt
      LEFT JOIN payment_event_transaction_mapping petm ON petm.bank_transaction_id = bt.id
      LEFT JOIN payment_events pe ON pe.id = petm.payment_event_id
      LEFT JOIN payments p ON p.id = pe.payment_id
      WHERE account = ${iban}
    `);

    return transactions.map(formatBankTransaction);
  }

  async getTransaction(id: string) {
    const transaction = await this.pg.one<DbBankTransaction>(sql`
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
  }

  async getAccountStatements(iban: string) {
    const statements = await this.pg.any<DbBankStatement>(sql`
      SELECT * FROM bank_statements WHERE account = ${iban}
    `);

    return statements.map(formatBankStatement);
  }

  async getBankStatement(id: string) {
    const statement = await this.pg.one<DbBankStatement>(sql`
      SELECT * FROM bank_statements WHERE id = ${id} LIMIT 1
    `);

    return statement && formatBankStatement(statement);
  }

  async getBankStatementTransactions(id: string) {
    const transactions = await this.pg.any<DbBankTransaction>(sql`
      SELECT bt.*
      FROM bank_statement_transaction_mapping bstm
      JOIN bank_transactions bt ON bt.id = bstm.bank_transaction_id
      WHERE bstm.bank_statement_id = ${id}
    `);

    return transactions.map(formatBankTransaction);
  }
}
