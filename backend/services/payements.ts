import { Service, Inject } from 'typedi';
import sql from 'sql-template-strings';
import { BankTransaction, DbEmail, DbPaymentEventTransactionMapping, Debt, EuroValue, internalIdentity, InternalIdentity, isPaymentInvoice, Payment } from '../../common/types';
import { FromDbType, PgClient } from '../db';
import { DebtService } from './debt';
import { Either } from 'fp-ts/lib/Either';
import * as E from 'fp-ts/lib/Either';
import { EmailService } from './email';
import { PayerService } from './payer';
import { euro, sumEuroValues } from '../../common/currency';
import { parseISO } from 'date-fns';

type PaymentWithEvents = Payment & {
  events: Array<{
    time: Date
    data: Record<string, unknown>
    type: 'created' | 'payment'
    amount: EuroValue
  }>,
}

function finnishReferenceChecksum(num: bigint): bigint {
  const factors = [7n, 3n, 1n];
  let acc = 0n;

  for (let i = 0; num > (10n ** BigInt(i)); i++) {
    const digit = num / (10n ** BigInt(i)) % 10n;
    acc += digit * factors[i % 3];
  }

  return (10n - acc % 10n) % 10n;
}

function createReferenceNumber(series: number, year: number, number: number) {
  const finRef = 1337n * (10n ** 11n) + BigInt(year) * (10n ** 7n) + BigInt(number) * (10n ** 3n) + BigInt(series);
  const finCheck = finnishReferenceChecksum(finRef);
  const content = finRef * 10n + finCheck;
  const tmp = content * (10n ** 6n) + 271500n;
  const checksum = 98n - (tmp % 97n);
  const numbers: Record<string, string> = { Y: `${checksum}`, X: `${content}` };
  const template = 'RFYY XXXX XXXX XXXX XXXX';
  const acc = new Array(template.length);

  for (let i = template.length - 1; i >= 0; i--) {
    const letter = template[i];

    if (letter in numbers) {
      const number = numbers[letter];
      const digit = number[number.length - 1];
      acc[i] = digit ?? '0';
      numbers[letter] = number.substring(0, number.length - 1);
    } else {
      acc[i] = letter;
    }
  }

  return acc.map(i => `${i}`).join('');
}

function formatPaymentNumber(parts: [number, number]): string {
  return parts.map(n => n.toString().padStart(4, '0')).join('-');
}

export type NewInvoice = {
  title: string
  series: number
  message: string
  createdAt?: Date
  debts: string[]
  referenceNumber?: string
  paymentNumber?: string
}

type BankTransactionDetails = {
  accountingId: string
  referenceNumber: string
  amount: EuroValue
  time: Date
}

type NewPaymentEvent = {
  amount: EuroValue,
  type: 'created' | 'payment'
  data?: Record<string, any>
  time?: Date
  transaction?: string
}

type PaymentType = Invoice | CashPayment

type Invoice = {
  type: 'invoice'
  data: Record<string, never>
}

type CashPayment = {
  type: 'cash'
  data: Record<string, never>
}

type DbPayment = {
  id: string
  type: 'invoice'
  title: string
  payer_id: string
  data: Record<string, unknown>,
  message: string
  balance: number
  status: 'canceled' | 'paid' | 'unpaid' | 'mispaid'
  updated_at: Date
  created_at: Date
  payment_number: number
  credited: boolean
  events: Array<{ id: string, time: string, type: string, data: any, amount: number }>
}

type NewPayment<T extends PaymentType> = {
  type: T['type'],
  title: string,
  message: string,
  data: Record<string, unknown>,
  debts: Array<string>,
  paymentNumber?: string,
  createdAt?: Date
}

@Service()
export class PaymentService {
  @Inject(() => PgClient)
    pg: PgClient;

  @Inject(() => DebtService)
    debtService: DebtService;

  @Inject(() => PayerService)
    payerService: PayerService;

  @Inject(() => EmailService)
    emailService: EmailService;

  async getPayments() {
    return this.pg
      .any<DbPayment>(sql`
        SELECT
          p.*,
          s.balance,
          s.status,
          s.payer,
          (SELECT payer_id FROM payment_debt_mappings pdm JOIN debt d ON pdm.debt_id = d.id WHERE pdm.payment_id = p.id LIMIT 1) AS payer_id,
          (SELECT ARRAY_AGG(TO_JSON(payment_events.*)) FROM payment_events WHERE payment_id = p.id) AS events,
          COALESCE(s.updated_at, p.created_at) AS updated_at
        FROM payments p
        JOIN payment_statuses s ON s.id = p.id
      `);
  }

  async getPayment(id: string) {
    return await this.pg
      .one<DbPayment>(sql`
        SELECT
          p.*,
          s.balance,
          s.status,
          s.payer,
          (SELECT ARRAY_AGG(TO_JSON(payment_events.*)) FROM payment_events WHERE payment_id = p.id) AS events,
          (SELECT payer_id FROM payment_debt_mappings pdm JOIN debt d ON pdm.debt_id = d.id WHERE pdm.payment_id = p.id LIMIT 1) AS payer_id,
          COALESCE(s.updated_at, p.created_at) AS updated_at
        FROM payments p
        JOIN payment_statuses s ON s.id = p.id
        WHERE p.id = ${id}
      `);
  }

  async getPayerPayments(id: InternalIdentity) {
    return this.pg
      .any<DbPayment>(sql`
        SELECT
          p.*,
          s.balance,
          s.status,
          s.payer,
          (SELECT ARRAY_AGG(TO_JSON(payment_events.*)) FROM payment_events WHERE payment_id = p.id) AS events,
          COALESCE(s.updated_at, p.created_at) AS updated_at
        FROM payments p
        JOIN payment_statuses s ON s.id = p.id
        WHERE s.payer->>'id' = ${id.value} AND (
          SELECT every(d.published_at IS NOT NULL)
          FROM payment_debt_mappings pdm
          JOIN debt d ON d.id = pdm.debt_id
          WHERE pdm.payment_id = p.id
        )
      `);
  }

  async getPaymentsContainingDebt(debtId: string) {
    return this.pg
      .any<DbPayment>(sql`
        SELECT
          p.*,
          s.balance,
          s.status,
          s.payer,
          (SELECT ARRAY_AGG(TO_JSON(payment_events.*)) FROM payment_events WHERE payment_id = p.id) AS events,
          COALESCE(s.updated_at, p.created_at) AS updated_at
        FROM payments p
        JOIN payment_statuses s ON s.id = p.id
        JOIN payment_debt_mappings pdm ON pdm.payment_id = p.id
        WHERE pdm.debt_id = ${debtId}
      `);
  }

  async getDefaultInvoicePaymentForDebt(debtId: string): Promise<Payment | null> {
    const payment = await this.pg
      .one<DbPayment>(sql`
        SELECT
          p.*,
          s.balance,
          s.status,
          s.payer,
          (SELECT ARRAY_AGG(TO_JSON(payment_events.*)) FROM payment_events WHERE payment_id = p.id) AS events,
          COALESCE(s.updated_at, p.created_at) AS updated_at
        FROM payments p
        JOIN payment_statuses s ON s.id = p.id
        JOIN payment_debt_mappings pdm ON pdm.payment_id = p.id
        JOIN debt d ON d.id = pdm.debt_id
        WHERE d.id = ${debtId} AND d.default_payment = p.id
      `);

    return payment;
  }

  async logPaymentEvent(
    paymentId: string,
    amount: EuroValue,
    data: object,
  ) {
    const result = await this.pg
      .one<DbPayment>(sql`
        INSERT INTO payment_events (payment_id, type, amount, data)
        VALUES (${paymentId}, 'payment', ${amount}, ${data})
        RETURNING *
     `);

    return result;
  }

  async createPaymentNumber(): Promise<[number, number]> {
    return await this.pg.tx(async (tx) => {
      const [result] = await tx.do<{ year: number, number: number }>(sql`
        UPDATE payment_numbers
        SET number = number + 1
        WHERE year = DATE_PART('year', NOW())
        RETURNING year, number
      `);

      if (result) {
        const { year, number } = result;
        return [year, number];
      }

      const [{ year, number }] = await tx.do<{ year: number, number: number }>(sql`INSERT INTO payment_numbers (year, number) VALUES (DATE_PART('year', NOW()), 0) RETURNING *`);

      return [year, number];
    });
  }

  async createInvoice(invoice: NewInvoice): Promise<Payment & { data: { due_date: string, reference_number: string } }> {
    const [year, number] = await this.createPaymentNumber();

    const reference_number = invoice.referenceNumber ?? createReferenceNumber(invoice.series ?? 0, year, number);

    const paymentNumber = invoice.paymentNumber ?? formatPaymentNumber([year, number]);

    const results = await Promise.all(invoice.debts.map(id => this.debtService.getDebt(id)));

    if (results.some(d => d === null)) {
      throw new Error('Debt does not exist');
    }

    const debts = results as Array<Debt>;

    if (debts.some(debt => debt.dueDate === null || debt.publishedAt === null)) {
      throw Error('Not all debts have due dates or are published!');
    }

    const due_dates = debts.flatMap(debt => debt.dueDate ? [new Date(debt.dueDate)] : []).sort();
    const due_date = due_dates[0];

    return this.createPayment({
      type: 'invoice',
      data: { reference_number, due_date },
      message: invoice.message,
      debts: invoice.debts,
      paymentNumber,
      title: invoice.title,
      createdAt: invoice.createdAt,
    }) as any;
  }

  async createPayment<T extends PaymentType>(payment: NewPayment<T>) {
    const paymentNumber = payment.paymentNumber ?? formatPaymentNumber(await this.createPaymentNumber());

    return this.pg.tx(async (tx) => {
      const [createdPayment] = await tx.do<DbPayment>(sql`
        INSERT INTO payments (type, data, message, title, payment_number, created_at)
        VALUES ('invoice', ${payment.data}, ${payment.message}, ${payment.title}, ${paymentNumber}, COALESCE(${payment.createdAt}, NOW()))
        RETURNING *
      `);

      if (!createdPayment) {
        throw new Error('Could not create payment');
      }

      await Promise.all(
        payment.debts.map((debt) => tx.do(sql`
          INSERT INTO payment_debt_mappings (payment_id, debt_id)
          VALUES (${createdPayment.id}, ${debt})
        `)),
      );

      const [{ total }] = (await tx.do<{ total: number }>(sql`
        SELECT SUM(c.amount) AS total
        FROM debt_component_mapping m
        JOIN debt_component c ON c.id = m.debt_component_id
        WHERE m.debt_id = ANY (${payment.debts})
      `));

      await tx.do(sql`
        INSERT INTO payment_events (payment_id, type, amount)
        VALUES (${createdPayment.id}, 'created', ${-total})
      `);

      return createdPayment;
    });
  }

  async createPaymentEvent(id: string, event: NewPaymentEvent) {
    const created = await this.pg.one<{ id: string }>(sql`
      INSERT INTO payment_events (payment_id, type, amount, data, time)
      VALUES (${id}, ${event.type}, ${event.amount.value}, ${event.data}, ${event.time})
      RETURNING *
    `);

    if (!created) {
      throw new Error('Could not create payment event');
    }

    if (event.transaction) {
      await this.pg.one(sql`
        INSERT INTO payment_event_transaction_mapping (payment_event_id, bank_transaction_id)
        VALUES (${created.id}, ${event.transaction})
      `);
    }

    return created;
  }

  async creditPayment(id: string) {
    const payment = await this.getPayment(id);

    if (!payment) {
      throw new Error('Payment not found');
    }

    await this.pg.any(sql`
      UPDATE payments
      SET credited = true
      WHERE id = ${id}
    `);
  }

  async getPaymentsByReferenceNumbers(rfs: string[]) {
    const payments = await this.pg.any<PaymentWithEvents>(sql`
      SELECT
        p.*,
        s.balance,
        s.status,
        s.payer,
        (SELECT payer_id FROM payment_debt_mappings pdm JOIN debt d ON pdm.debt_id = d.id WHERE pdm.payment_id = p.id LIMIT 1) AS payer_id,
        (SELECT ARRAY_AGG(TO_JSON(payment_events.*)) FROM payment_events WHERE payment_id = p.id) AS events,
        COALESCE(s.updated_at, p.created_at) AS updated_at
      FROM payments p
      JOIN payment_statuses s ON s.id = p.id
      WHERE p.data->>'reference_number' = ANY (${rfs.map(rf => rf.replace(/^0+/, ''))})
    `);

    return payments;
  }

  async createPaymentEventFromTransaction(tx: BankTransaction, pPayment?: string) {
    const existing_mapping = await this.pg.one<DbPaymentEventTransactionMapping>(sql`
      SELECT *
      FROM payment_event_transaction_mapping
      WHERE bank_transaction_id = ${tx.id}
    `);

    if (existing_mapping) {
      console.log('Existing mapping');
      return null;
    }

    let payment;

    if (pPayment) {
      payment = await this.getPayment(pPayment);
    } else if (tx.reference) {
      [payment] = await this.getPaymentsByReferenceNumbers([tx.reference]);
    } else {
      console.log('No reference');
      return null;
    }

    if (!payment) {
      console.log('No match');
      return null;
    }

    return await this.createPaymentEvent(payment.id, {
      type: 'payment',
      amount: tx.amount,
      time: tx.date,
      transaction: tx.id,
    });
  }

  async createBankTransactionPaymentEvent(details: BankTransactionDetails) {
    const payments = await this.getPaymentsByReferenceNumbers([details.referenceNumber]);

    if (payments.length === 0) {
      return null;
    }

    const [payment] = payments;
    const already_exists = payment.events.some((event) => event.data?.accounting_id === details.accountingId);

    if (already_exists) {
      return null;
    }

    return await this.createPaymentEvent(payment.id, {
      type: 'payment',
      amount: details.amount,
      time: details.time,
      data: {
        accounting_id: details.accountingId,
      },
    });
  }

  async sendNewPaymentNotification(id: string): Promise<Either<string, FromDbType<DbEmail>>> {
    const payment = await this.getPayment(id);

    if (!payment) {
      return E.left('No such payment');
    }

    const debts = await this.debtService.getDebtsByPayment(id);
    const total = debts.map(debt => debt?.total ?? euro(0)).reduce(sumEuroValues, euro(0));
    const email = await this.payerService.getPayerPrimaryEmail(internalIdentity(payment.payer_id));

    if (!email) {
      return E.left('Could not determine email for payer');
    }

    if (!isPaymentInvoice(payment)) {
      return E.left('Payment is not an invoice');
    }

    const created = await this.emailService.createEmail({
      template: 'new-invoice',
      recipient: email.email,
      payload: {
        title: payment.title,
        number: payment.payment_number,
        date: payment.created_at,
        dueDate: parseISO(payment.data.due_date),
        amount: total,
        debts,
        referenceNumber: payment.data.reference_number,
        message: payment.message,
      },
      subject: '[Lasku / Invoice] ' + payment.title,
    });

    return E.fromNullable('Could not create email')(created);
  }
}
