import { Service, Inject } from 'typedi';
import sql from 'sql-template-strings';
import { BankTransaction, DbDebt, DbEmail, DbPayerProfile, DbPaymentEvent, DbPaymentEventTransactionMapping, Debt, EuroValue, internalIdentity, InternalIdentity, isPaymentInvoice, Payment, PaymentEvent, PaymentLedgerOptions, PaymentStatus } from '../../common/types';
import * as R from 'remeda';
import { FromDbType, PgClient, TxClient } from '../db';
import { DebtService, formatDebt } from './debt';
import { Either } from 'fp-ts/lib/Either';
import * as E from 'fp-ts/lib/Either';
import { EmailService } from './email';
import { BankingService } from './banking';
import { formatPayerProfile, PayerService } from './payer';
import { cents, euro, sumEuroValues } from '../../common/currency';
import { format, formatISO, isBefore, isPast, parseISO, subDays } from 'date-fns';
import { ReportService } from './reports';
import { pipe } from 'fp-ts/lib/function';
import { groupBy } from 'fp-ts/lib/NonEmptyArray';
import { toArray } from 'fp-ts/Record';
import * as T from 'fp-ts/lib/Task';
import * as A from 'fp-ts/lib/Array';
import { DebtCentersService } from './debt_centers';
import Stripe from 'stripe';

export type PaymentCreditReason = 'manual' | 'paid';

type PaymentCreationOptions = {
  sendNotification?: boolean
}

type PaymentWithEvents = Payment & {
  events: Array<{
    time: Date
    data: Record<string, unknown>
    type: 'created' | 'payment'
    amount: EuroValue
  }>,
}

function normalizeReferenceNumber(reference: string) {
  return reference.replace(/^0+/, '0').replace(/[^A-Z0-9]/ig, '').toUpperCase();
}

export function formatReferenceNumber(reference: string) {
  return reference.match(/.{1,4}/g)?.join?.(' ') ?? reference;
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
  const template = 'RFYYXXXXXXXXXXXXXXXX';
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

const formatPaymentEvent = (db: DbPaymentEvent): PaymentEvent => ({
  id: db.id,
  paymentId: db.payment_id,
  type: db.type,
  amount: cents(db.amount),
  time: db.time,
  data: db.data as any,
});

export type NewInvoice = {
  title: string
  series: number
  message: string
  date?: Date
  debts: string[]
  referenceNumber?: string
  paymentNumber?: string
}

export type NewStripePayment = {
  debts: string[]
}

export type StripePaymentResult = {
  payment: Payment
  clientSecret: string
}

type BankTransactionDetails = {
  accountingId: string
  referenceNumber: string
  amount: EuroValue
  time: Date
}

type NewPaymentEvent = {
  amount: EuroValue,
  type: 'created' | 'payment' | 'stripe.intent-created' | 'failed' | 'canceled' | 'other'
  data?: Record<string, any>
  time?: Date
  transaction?: string
}

type PaymentType = Invoice | CashPayment | StripePayment

type Invoice = {
  type: 'invoice'
  data: Record<string, never>
}

type CashPayment = {
  type: 'cash'
  data: Record<string, never>
}

type StripePayment = {
  type: 'stripe'
}

export type DbPayment = {
  id: string
  human_id: string
  human_id_nonce?: number
  accounting_period: number
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
  events: Array<DbPaymentEvent>
}

type NewPayment<T extends PaymentType, D = null> = {
  type: T['type'],
  title: string,
  message: string,
  data: D | ((p: Omit<Payment, 'data'>) => D),
  debts: Array<string>,
  paymentNumber?: string,
  createdAt?: Date
}

export const formatPayment = (db: DbPayment): Payment => ({
  id: db.id,
  humanId: db.human_id,
  humanIdNonce: db.human_id_nonce,
  accountingPeriod: db.accounting_period,
  type: db.type,
  title: db.title,
  paymentNumber: db.payment_number,
  payerId: internalIdentity(db.payer_id),
  data: db.data,
  message: db.message,
  balance: cents(db.balance),
  status: db.status,
  updatedAt: db.updated_at,
  createdAt: db.created_at,
  credited: db.credited,
  events: db.events.map(formatPaymentEvent),
})

@Service()
export class PaymentService {
  @Inject(() => PgClient)
  pg: PgClient;

  @Inject('stripe')
  stripe: Stripe;

  @Inject(() => DebtService)
  debtService: DebtService;

  @Inject(() => DebtCentersService)
  debtCentersService: DebtCentersService;

  @Inject(() => PayerService)
  payerService: PayerService;

  @Inject(() => EmailService)
  emailService: EmailService;

  @Inject(() => BankingService)
  bankingService: BankingService;

  @Inject(() => ReportService)
  reportService: ReportService;

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

  async getPayment(id: string): Promise<Payment | null> {
    const result = await this.pg
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

    return result && formatPayment(result);
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

    return payment && formatPayment(payment);
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

  async createInvoice(invoice: NewInvoice, options: PaymentCreationOptions = {}): Promise<Payment & { data: { due_date: string, reference_number: string } }> {
    const results = await Promise.all(invoice.debts.map(id => this.debtService.getDebt(id)));

    if (results.some(d => d === null)) {
      throw new Error('Debt does not exist');
    }

    const debts = results as Array<Debt>;

    if (debts.some(debt => debt.dueDate === null && debt.publishedAt === null)) {
      throw Error('Not all debts have due dates or are published!');
    }

    const due_dates = debts.flatMap(debt => debt.dueDate ? [new Date(debt.dueDate)] : []).sort();
    const due_date = due_dates[0];

    return this.createPayment({
      type: 'invoice',
      data: (payment) => {
        if (payment.humanIdNonce === undefined) {
          throw new Error('Generated payment does not have automatically assigned id');
        }

        return {
          reference_number: invoice.referenceNumber
            ? normalizeReferenceNumber(invoice.referenceNumber)
            : createReferenceNumber(invoice.series ?? 0, payment.accountingPeriod, payment.humanIdNonce),
          due_date: formatISO(due_date),
          date: invoice.date ?? new Date(),
        };
      },
      message: invoice.message,
      debts: invoice.debts,
      paymentNumber: invoice.paymentNumber,
      title: invoice.title,
    }, options);
  }

  async createStripePayment(options: NewStripePayment): Promise<StripePaymentResult> {
    const results = await Promise.all(options.debts.map(id => this.debtService.getDebt(id)));

    if (results.some(d => d === null)) {
      throw new Error('Debt does not exist');
    }

    const debts = results as Array<Debt>;

    if (debts.some(debt => debt.dueDate === null && debt.publishedAt === null)) {
      throw Error('Not all debts have due dates or are published!');
    }

    const { id } = await this.createPayment({
      type: 'stripe',
      message: '',
      title: '',
      debts: options.debts,
      data: {},
    });

    let payment = await this.getPayment(id);

    if (payment === null) {
      throw new Error('Failed to create payment.');
    }

    console.log(payment);

    const intent = await this.stripe.paymentIntents.create({
      amount: -payment.balance.value,
      currency: payment.balance.currency,
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: {
        paymentId: payment.id,
      },
    });

    if (intent.client_secret === null) {
      return Promise.reject();
    }

    await this.createPaymentEvent(payment.id, {
      type: 'stripe.intent-created',
      amount: cents(0),
      data: {
        intent: intent.id,
      },
    });

    payment = await this.getPayment(id);

    if (payment === null) {
      throw new Error('Failed to create payment.');
    }

    return {
      payment,
      clientSecret: intent.client_secret,
    };
  }

  async createPayment<T extends PaymentType, D>(payment: NewPayment<T, D>, options: PaymentCreationOptions = {}): Promise<Omit<Payment, 'data'> & { data: D }> {
    const created = await this.pg.tx(async (tx) => {
      const [createdPayment] = await tx.do<Omit<DbPayment, 'data'> & { data: Record<string, never> | D }>(sql`
        INSERT INTO payments (type, data, message, title, created_at)
        VALUES (
          ${payment.type},
          ${typeof payment.data !== 'function' ? payment.data : {}},
          ${payment.message},
          ${payment.title},
          COALESCE(${payment.createdAt}, NOW())
        )
        RETURNING *
      `);

      createdPayment.events = [];

      if (!createdPayment) {
        throw new Error('Could not create payment');
      }

      if (typeof payment.data === 'function') {
        const callback = payment.data as any as ((p: Payment) => D);
        const data = callback(formatPayment({ ...createdPayment, data: {} }));
        console.log('CALLBACK!', createdPayment, data);
        await tx.do(sql`
          UPDATE payments SET data = ${data} WHERE id = ${createdPayment.id}
        `);
        createdPayment.data = data;
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

      const formated = formatPayment(createdPayment as any) as any;

      return formated;
    });

    await this.onPaymentCreated(created, options);

    return created;
  }

  async onPaymentCreated(payment: Payment, options: PaymentCreationOptions) {
    if (isPaymentInvoice(payment)) {
      const isBackdated = isBefore(parseISO(payment.data.date), subDays(new Date(), 1));

      console.log(payment.data.date, isBackdated);

      if (!isBackdated && options.sendNotification !== false) {
        const email = await this.sendNewPaymentNotification(payment.id);

        if (E.isRight(email)) {
          await this.emailService.sendEmail(email.right.id);
        } else {
          throw email.left;
        }
      }
    }

    if (isPaymentInvoice(payment)) {
      await this.bankingService.assignTransactionsToPaymentByReferenceNumber(payment.id, payment.data.reference_number);
    }
  }

  private async onPaymentPaid(id: string, event: PaymentEvent) {
    const payment = await this.getPayment(id);
    const debts = await this.debtService.getDebtsByPayment(id);

    if (!payment) {
      return;
    }

    await Promise.all(debts.map((debt) => this.debtService.onDebtPaid(debt, payment, event)));
  }

  async createPaymentEvent(id: string, event: NewPaymentEvent): Promise<PaymentEvent> {
    const [created, oldStatus, newStatus] = await this.pg.tx(async (tx) => {
      const [{ status: initialStatus }] = await tx.do<{ status: PaymentStatus }>(sql`
        SELECT status FROM payment_statuses WHERE id = ${id}
      `);

      const [created] = await tx.do<DbPaymentEvent>(sql`
        INSERT INTO payment_events (payment_id, type, amount, data, time)
        VALUES (${id}, ${event.type}, ${event.amount.value}, ${event.data}, ${event.time ?? new Date()})
        RETURNING *
      `);

      if (!created) {
        throw new Error('Could not create payment event');
      }

      if (event.transaction) {
        await tx.do(sql`
          INSERT INTO payment_event_transaction_mapping (payment_event_id, bank_transaction_id)
          VALUES (${created.id}, ${event.transaction})
        `);
      }

      const [{ status: newStatus }] = await tx.do<{ status: PaymentStatus }>(sql`
        SELECT status FROM payment_statuses WHERE id = ${id}
      `);

      return [formatPaymentEvent(created), initialStatus, newStatus];
    });

    if (oldStatus !== newStatus) {
      if (newStatus === 'paid') {
        await this.onPaymentPaid(id, created);
      }
    }

    return created;
  }

  async creditPayment(id: string, reason: PaymentCreditReason) {
    const payment = await this.getPayment(id);

    if (!payment) {
      throw new Error('Payment not found');
    }

    const payer = await this.payerService.getPayerProfileByInternalIdentity(payment.payerId);
    const email = await this.payerService.getPayerPrimaryEmail(payment.payerId);
    const debts = await this.debtService.getDebtsByPayment(id);
    const amount = debts.map(debt => debt?.total ?? euro(0)).reduce(sumEuroValues, euro(0));

    await this.pg.any(sql`
      UPDATE payments
      SET credited = true
      WHERE id = ${id}
    `);

    if (payer && email) {
      const message = await this.emailService.createEmail({
        template: 'payment-credited',
        recipient: email.email,
        subject: '[Invoice credited / Lasku hyvitetty] ' + payment.title,
        payload: {
          payment,
          reason,
          debts,
          amount,
          payer,
        },
        debts: debts.map((debt) => debt.id),
      });

      if (!message) {
        console.error('Failed to send message.');
      } else {
        await this.emailService.sendEmail(message.id);
      }
    }
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
      return null;
    }

    let payment;

    if (pPayment) {
      payment = await this.getPayment(pPayment);
    } else if (tx.reference) {
      [payment] = await this.getPaymentsByReferenceNumbers([tx.reference]);
    } else {
      return null;
    }

    if (!payment) {
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
      transaction: details.accountingId,
    });
  }

  async sendNewPaymentNotification(id: string): Promise<Either<string, FromDbType<DbEmail>>> {
    const payment = await this.getPayment(id);

    if (!payment) {
      return E.left('No such payment');
    }

    const debts = await this.debtService.getDebtsByPayment(id);
    const total = debts.map(debt => debt?.total ?? euro(0)).reduce(sumEuroValues, euro(0));
    const payer = await this.payerService.getPayerProfileByInternalIdentity(payment.payerId);
    const email = await this.payerService.getPayerPrimaryEmail(payment.payerId);

    if (!email || !payer) {
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
        number: payment.paymentNumber,
        date: parseISO(payment.data.date),
        dueDate: parseISO(payment.data.due_date),
        amount: total,
        debts,
        referenceNumber: payment.data.reference_number,
        message: payment.message,
        receiverName: payer.name,
      },
      debts: debts.map((debt) => debt.id),
      subject: '[Lasku / Invoice] ' + payment.title,
    });

    return E.fromNullable('Could not create email')(created);
  }

  async generatePaymentLedger(options: Omit<PaymentLedgerOptions, 'startDate' | 'endDate'> & Record<'startDate' | 'endDate', Date>, generatedBy: InternalIdentity, parent?: string) {
    const results = await this.pg.any<{ event: DbPaymentEvent, debt: DbDebt, payment: DbPayment, payer: DbPayerProfile }>(sql`
      SELECT DISTINCT ON (event.id, debt.id)
        TO_JSONB(event.*) AS event,
        TO_JSONB(debt.*) AS debt,
        TO_JSONB(payment.*) AS payment,
        TO_JSONB(payer.*) AS payer
      FROM payment_events event
      JOIN payments payment ON payment.id = event.payment_id
      JOIN payment_debt_mappings pdm ON pdm.payment_id = event.payment_id
      JOIN debt ON debt.id = pdm.debt_id
      JOIN payer_profiles payer ON payer.id = debt.payer_id
      WHERE
        event.time BETWEEN ${options.startDate} AND ${options.endDate} AND
      `
      .append(
        options.paymentType
          ? sql` payment.type = ${options.paymentType} `
          : sql` TRUE `
      )
      .append(sql`AND`)
      .append(
        options.eventTypes
          ? sql` event.type = ANY (${options.eventTypes}) `
          : sql` TRUE `
      )
    );

    const events = R.sortBy(results
      .map(({ payment, payer, event, debt }) => ({
        ...formatPaymentEvent({ ...event, time: parseISO(event.time as any) }),
        debt: formatDebt(debt),
        payer: formatPayerProfile(payer),
        payment: formatPayment({ ...payment, events: [] }),
      })),
      (item) => item.time,
    );

    type EventDetails = (typeof events)[0];

    let groups;

    if (options.groupBy) {
      let getGroupKey;
      let getGroupDetails;

      if (options.groupBy === 'center') {
        getGroupKey = (event: EventDetails) => event.debt.debtCenterId;
        getGroupDetails = async (id: string) => {
          const center = await this.debtCentersService.getDebtCenter(id);
          return {
            id: center?.humanId ?? 'Unknown',
            name: center?.name ?? 'Unknown',
          };
        };
      } else {
        getGroupKey = (event: EventDetails) => event.payer.id.value;
        getGroupDetails = async (id: string, [row]: EventDetails[]) => ({
          id,
          name: row.payer.name,
        });
      }

      const createGroupUsing = (nameResolver: (id: string, rows: EventDetails[]) => Promise<{ name: string, id: string }>) => ([key, events]: [string, EventDetails[]]) => async () => {
        const { name, id } = await nameResolver(key, events);
        return { name, events, id }; 
      };

      groups = await pipe(
        events,
        groupBy(getGroupKey),
        toArray,
        A.traverse(T.ApplicativePar)(createGroupUsing(getGroupDetails)),
      )();
    } else {
      groups = [{ events }];
    }

    let name = `Payment Ledger ${format(options.startDate, 'dd.MM.yyyy')} - ${format(options.endDate, 'dd.MM.yyyy')}`;

    if (options.paymentType) {
      name = options.paymentType[0].toUpperCase() + options.paymentType.substring(1) + ' ' + name;
    }

    return this.reportService.createReport({
      template: 'payment-ledger',
      name,
      options,
      payload: { options, groups },
      parent,
      generatedBy,
    });
  }
}
