import sql from 'sql-template-strings';
import {
  DbDebt,
  DbPayerProfile,
  DbPayment,
  DbPaymentEvent,
  Debt,
  Email,
  EuroValue,
  internalIdentity,
  InternalIdentity,
  isPaymentInvoice,
  NewInvoice,
  Payment,
  PaymentEvent,
  PaymentLedgerOptions,
  PaymentStatus,
} from '@bbat/common/build/src/types';
import * as R from 'remeda';
import { FromDbType } from '../../db';
import { formatDebt } from '../debts';
import { Either } from 'fp-ts/lib/Either';
import * as E from 'fp-ts/lib/Either';
import { formatPayerProfile } from '../payers';
import { cents, euro, sumEuroValues } from '@bbat/common/build/src/currency';
import { format, formatISO, isBefore, parseISO, subDays } from 'date-fns';
import { pipe } from 'fp-ts/lib/function';
import { groupBy } from 'fp-ts/lib/NonEmptyArray';
import { toArray } from 'fp-ts/lib/Record';
import * as T from 'fp-ts/lib/Task';
import * as A from 'fp-ts/lib/Array';
import { ModuleDeps } from '@/app';
import * as payerService from '@/services/payers/definitions';
import * as debtService from '@/services/debts/definitions';
import * as defs from './definitions';
import { assignTransactionsToPaymentByReferenceNumber } from '../banking/definitions';
import { getDebtCenter } from '../debt-centers/definitions';
import { createReport } from '../reports/definitions';
import { createEmail, sendEmail } from '../email/definitions';

export class RegistrationError extends Error {}

export type PaymentCreditReason = 'manual' | 'paid';

type PaymentCreationOptions = {
  sendNotification?: boolean;
};

type PaymentWithEvents = Payment & {
  events: Array<{
    time: Date;
    data: Record<string, unknown>;
    type: 'created' | 'payment';
    amount: EuroValue;
  }>;
};

function normalizeReferenceNumber(reference: string) {
  return reference
    .replace(/^0+/, '0')
    .replace(/[^A-Z0-9]/gi, '')
    .toUpperCase();
}

export function formatReferenceNumber(reference: string) {
  return reference.match(/.{1,4}/g)?.join?.(' ') ?? reference;
}

function finnishReferenceChecksum(num: bigint): bigint {
  const factors = [7n, 3n, 1n];
  let acc = 0n;

  for (let i = 0; num > 10n ** BigInt(i); i++) {
    const digit = (num / 10n ** BigInt(i)) % 10n;
    acc += digit * factors[i % 3];
  }

  return (10n - (acc % 10n)) % 10n;
}

function createReferenceNumber(series: number, year: number, number: number) {
  const finRef =
    1337n * 10n ** 11n +
    BigInt(year) * 10n ** 7n +
    BigInt(number) * 10n ** 3n +
    BigInt(series);
  const finCheck = finnishReferenceChecksum(finRef);
  const content = finRef * 10n + finCheck;
  const tmp = content * 10n ** 6n + 271500n;
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

const formatPaymentEvent = (db: DbPaymentEvent): PaymentEvent => ({
  id: db.id,
  paymentId: db.payment_id,
  type: db.type,
  amount: cents(db.amount),
  time: db.time,
  data: db.data as any,
});

export type NewStripePayment = {
  debts: string[];
};

export type StripePaymentResult = {
  payment: Payment;
  clientSecret: string;
};

type BankTransactionDetails = {
  accountingId: string;
  referenceNumber: string;
  amount: EuroValue;
  time: Date;
};

type NewPaymentEvent = {
  amount: EuroValue;
  type:
    | 'created'
    | 'payment'
    | 'stripe.intent-created'
    | 'failed'
    | 'canceled'
    | 'other';
  data?: Record<string, any>;
  time?: Date;
  transaction?: string;
};

type PaymentType = Invoice | CashPayment | StripePayment;

type Invoice = {
  type: 'invoice';
  data: Record<string, never>;
};

type CashPayment = {
  type: 'cash';
  data: Record<string, never>;
};

type StripePayment = {
  type: 'stripe';
};

/*export type DbPayment = {
  id: string;
  human_id: string;
  human_id_nonce?: number;
  accounting_period: number;
  type: 'invoice';
  title: string;
  payer_id: string;
  data: Record<string, unknown>;
  message: string;
  balance: number;
  status: 'canceled' | 'paid' | 'unpaid' | 'mispaid';
  updated_at: Date;
  created_at: Date;
  payment_number: number;
  credited: boolean;
  events: Array<DbPaymentEvent>;
};*/

type NewPayment<T extends PaymentType, D = null> = {
  type: T['type'];
  title: string;
  message: string;
  data: D | ((p: Omit<Payment, 'data'>) => D);
  debts: Array<string>;
  paymentNumber?: string;
  createdAt?: Date;
};

export const formatPayment = (db: DbPayment): Payment => ({
  id: db.id,
  humanId: db.human_id,
  humanIdNonce: db.human_id_nonce ?? null,
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
});

type UpdatePaymentEventOptions = {
  amount?: EuroValue;
};

export default ({ pg, bus, stripe }: ModuleDeps) => {
  async function getPayments() {
    const payments = await pg.any<DbPayment>(sql`
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

    return payments.map(formatPayment);
  }

  bus.register(defs.getPayments, getPayments);

  async function getPayment(id: string): Promise<Payment | null> {
    const result = await pg.one<DbPayment>(sql`
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

  bus.register(defs.getPayment, getPayment);

  async function getPaymentsByReferenceNumbers(rfs: string[]) {
    const payments = await pg.any<PaymentWithEvents>(sql`
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
      WHERE p.data->>'reference_number' = ANY (${rfs.map(rf =>
        rf.replace(/^0+/, ''),
      )})
    `);

    return payments;
  }

  async function onPaymentPaid(id: string, event: PaymentEvent) {
    const payment = await getPayment(id);
    const debts = await bus.exec(debtService.getDebtsByPayment, id);

    if (!payment) {
      return;
    }

    await Promise.all(
      debts.map(debt =>
        bus.exec(debtService.onDebtPaid, { debt, payment, event }),
      ),
    );
  }

  bus.register(defs.createPaymentEvent, async ({ paymentId: id, ...event }) => {
    const [created, oldStatus, newStatus] = await pg.tx(async tx => {
      const [{ status: initialStatus }] = await tx.do<{
        status: PaymentStatus;
      }>(sql`
        SELECT status FROM payment_statuses WHERE id = ${id}
      `);

      const [created] = await tx.do<DbPaymentEvent>(sql`
        INSERT INTO payment_events (payment_id, type, amount, data, time)
        VALUES (${id}, ${event.type}, ${event.amount.value}, ${event.data}, ${
          event.time ?? new Date()
        })
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

      const [{ status: newStatus }] = await tx.do<{
        status: PaymentStatus;
      }>(sql`
        SELECT status FROM payment_statuses WHERE id = ${id}
      `);

      return [formatPaymentEvent(created), initialStatus, newStatus];
    });

    if (oldStatus !== newStatus) {
      if (newStatus === 'paid') {
        await onPaymentPaid(id, created);
      }
    }

    return created;
  });

  bus.register(
    defs.createPaymentEventFromTransaction,
    async ({ transaction: tx, amount, paymentId }) => {
      const existing_mapping =
        await pg.one<DbPaymentEventTransactionMapping>(sql`
      SELECT *
      FROM payment_event_transaction_mapping
      WHERE bank_transaction_id = ${tx.id}
    `);

      if (existing_mapping) {
        return null;
      }

      let payment;

      if (paymentId) {
        payment = await getPayment(paymentId);
      } else if (tx.reference) {
        [payment] = await getPaymentsByReferenceNumbers([tx.reference]);
      } else {
        return null;
      }

      if (!payment) {
        return null;
      }

      return await bus.exec(defs.createPaymentEvent, {
        paymentId: payment.id,
        type: 'payment',
        amount: amount ?? tx.amount,
        time: tx.date,
        transaction: tx.id,
        data: {},
      });
    },
  );

  bus.register(defs.getPayerPayments, async id => {
    const payments = await pg.any<DbPayment>(sql`
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

    return payments.map(formatPayment);
  });

  bus.register(defs.getPaymentsContainingDebt, async debtId => {
    const payments = await pg.any<DbPayment>(sql`
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

    return payments.map(formatPayment);
  });

  bus.register(defs.getDefaultInvoicePaymentForDebt, async (debtId: string) => {
    const payment = await pg.one<DbPayment>(sql`
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
  });

  async function logPaymentEvent(
    paymentId: string,
    amount: EuroValue,
    data: object,
  ) {
    const result = await pg.one<DbPayment>(sql`
        INSERT INTO payment_events (payment_id, type, amount, data)
        VALUES (${paymentId}, 'payment', ${amount.value}, ${data})
        RETURNING *
     `);

    return result;
  }

  async function updatePaymentData(id: string, data: Record<string, unknown>) {
    pg.any(sql`
      UPDATE payments SET data = ${data} WHERE id = ${id}
    `);
  }

  bus.register(defs.createInvoice, async ({ invoice, options }) => {
    const results = await Promise.all(
      invoice.debts.map(id => bus.exec(debtService.getDebt, id)),
    );

    if (results.some(d => d === null)) {
      throw new Error('Debt does not exist');
    }

    const debts = results as Array<Debt>;

    if (
      debts.some(debt => debt.dueDate === null && debt.publishedAt === null)
    ) {
      throw Error('Not all debts have due dates or are published!');
    }

    const due_dates = debts
      .flatMap(debt => (debt.dueDate ? [new Date(debt.dueDate)] : []))
      .sort();
    const due_date = due_dates[0];

    const payment = await bus.exec(defs.createPayment, {
      payment: {
        type: 'invoice',
        message: invoice.message,
        debts: invoice.debts,
        paymentNumber: invoice.paymentNumber ?? undefined,
        title: invoice.title,
        data: {},
      },
      options,
    });

    if (payment.humanIdNonce === undefined) {
      throw new Error(
        'Generated payment does not have automatically assigned id',
      );
    }

    const data = {
      reference_number: invoice.referenceNumber
        ? normalizeReferenceNumber(invoice.referenceNumber)
        : createReferenceNumber(
            invoice.series ?? 0,
            payment.accountingPeriod,
            payment.humanIdNonce ?? 0,
          ),
      due_date: formatISO(due_date),
      date: invoice.date ?? new Date(),
    };

    await updatePaymentData(payment.id, data);

    return {
      ...payment,
      data,
    };
  });

  bus.register(defs.createStripePayment, async options => {
    const results = await Promise.all(
      options.debts.map(id => bus.exec(debtService.getDebt, id)),
    );

    if (results.some(d => d === null)) {
      throw new Error('Debt does not exist');
    }

    const debts = results as Array<Debt>;

    if (
      debts.some(debt => debt.dueDate === null && debt.publishedAt === null)
    ) {
      throw Error('Not all debts have due dates or are published!');
    }

    const { id } = await bus.exec(defs.createPayment, {
      payment: {
        type: 'stripe',
        message: '',
        title: '',
        debts: options.debts,
        data: {},
      },
    });

    let payment = await getPayment(id);

    if (payment === null) {
      throw new Error('Failed to create payment.');
    }

    console.log(payment);

    const intent = await stripe.paymentIntents.create({
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

    await bus.exec(defs.createPaymentEvent, {
      paymentId: payment.id,
      type: 'stripe.intent-created',
      amount: cents(0),
      transaction: null,
      data: {
        intent: intent.id,
      },
    });

    payment = await getPayment(id);

    if (payment === null) {
      throw new Error('Failed to create payment.');
    }

    return {
      payment,
      clientSecret: intent.client_secret,
    };
  });

  bus.register(defs.createPayment, async ({ payment, options = {} }) => {
    const created = await pg.tx(async tx => {
      const [createdPayment] = await tx.do<DbPayment>(sql`
        INSERT INTO payments (type, data, message, title, created_at)
        VALUES (
          ${payment.type},
          ${payment.data},
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

      await Promise.all(
        payment.debts.map(debt =>
          tx.do(sql`
            INSERT INTO payment_debt_mappings (payment_id, debt_id)
            VALUES (${createdPayment.id}, ${debt})
          `),
        ),
      );

      const [{ total }] = await tx.do<{ total: number }>(sql`
        SELECT SUM(c.amount) AS total
        FROM debt_component_mapping m
        JOIN debt_component c ON c.id = m.debt_component_id
        WHERE m.debt_id = ANY (${payment.debts})
      `);

      await tx.do(sql`
        INSERT INTO payment_events (payment_id, type, amount)
        VALUES (${createdPayment.id}, 'created', ${-total})
      `);

      const formated = formatPayment(createdPayment as any) as any;

      return formated;
    });

    await onPaymentCreated(created, options);

    return created;
  });

  async function onPaymentCreated(
    payment: Payment,
    options: PaymentCreationOptions,
  ) {
    if (isPaymentInvoice(payment)) {
      const isBackdated = isBefore(
        parseISO(payment.data.date),
        subDays(new Date(), 1),
      );

      if (!isBackdated && options.sendNotification !== false) {
        const email = await sendNewPaymentNotification(payment.id);

        if (E.isRight(email)) {
          await bus.exec(sendEmail, email.right.id);
        } else {
          throw email.left;
        }
      }
    }

    if (isPaymentInvoice(payment)) {
      await bus.exec(assignTransactionsToPaymentByReferenceNumber, {
        paymentId: payment.id,
        referenceNumber: payment.data.reference_number,
      });
    }
  }

  bus.register(defs.creditPayment, async ({ id, reason }) => {
    const payment = await getPayment(id);

    if (!payment) {
      throw new Error('Payment not found');
    }

    const payer = await bus.exec(
      payerService.getPayerProfileByInternalIdentity,
      payment.payerId,
    );
    const email = await bus.exec(
      payerService.getPayerPrimaryEmail,
      payment.payerId,
    );
    const debts = await bus.exec(debtService.getDebtsByPayment, id);
    const amount = debts.map(debt => debt.total).reduce(sumEuroValues, euro(0));

    await pg.any(sql`
      UPDATE payments
      SET credited = true
      WHERE id = ${id}
    `);

    if (payer && email) {
      const message = await bus.exec(createEmail, {
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
        debts: debts.map(debt => debt.id),
      });

      if (!message) {
        throw new Error('Failed to send message.');
      } else {
        await bus.exec(sendEmail, message.id);
      }
    } else {
      throw new Error('Failed to credit payment!');
    }

    return getPayment(id);
  });

  async function getPaymentEvent(id: string) {
    const row = await pg.one<DbPaymentEvent>(sql`
      SELECT * FROM payment_events WHERE id = ${id}
    `);

    return row && formatPaymentEvent(row);
  }

  bus.register(defs.getPaymentEvent, getPaymentEvent);

  async function createBankTransactionPaymentEvent(
    details: BankTransactionDetails,
  ) {
    const payments = await getPaymentsByReferenceNumbers([
      details.referenceNumber,
    ]);

    if (payments.length === 0) {
      return null;
    }

    const [payment] = payments;
    const already_exists = payment.events.some(
      event => event.data?.accounting_id === details.accountingId,
    );

    if (already_exists) {
      return null;
    }

    return await bus.exec(defs.createPaymentEvent, {
      paymentId: payment.id,
      type: 'payment',
      amount: details.amount,
      time: details.time,
      data: {
        accounting_id: details.accountingId,
      },
      transaction: details.accountingId,
    });
  }

  async function sendNewPaymentNotification(
    id: string,
  ): Promise<Either<string, Email>> {
    const payment = await getPayment(id);

    if (!payment) {
      return E.left('No such payment');
    }

    const debts = await bus.exec(debtService.getDebtsByPayment, id);
    const total = debts.map(debt => debt.total).reduce(sumEuroValues, euro(0));
    const payer = await bus.exec(
      payerService.getPayerProfileByInternalIdentity,
      payment.payerId,
    );
    const email = await bus.exec(
      payerService.getPayerPrimaryEmail,
      payment.payerId,
    );

    if (!email || !payer) {
      return E.left('Could not determine email for payer');
    }

    if (!isPaymentInvoice(payment)) {
      return E.left('Payment is not an invoice');
    }

    const created = await bus.exec(createEmail, {
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
      debts: debts.map(debt => debt.id),
      subject: '[Lasku / Invoice] ' + payment.title,
    });

    return E.fromNullable('Could not create email')(created);
  }

  bus.register(defs.sendNewPaymentNotification, sendNewPaymentNotification);

  async function generatePaymentLedger(
    options: Omit<PaymentLedgerOptions, 'startDate' | 'endDate'> &
      Record<'startDate' | 'endDate', Date>,
    generatedBy: InternalIdentity,
    parent?: string,
  ) {
    const results = await pg.any<{
      event: DbPaymentEvent;
      debt: DbDebt;
      payment: DbPayment;
      payer: DbPayerProfile;
    }>(
      sql`
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
            : sql` TRUE `,
        )
        .append(sql`AND`)
        .append(
          options.eventTypes
            ? sql` event.type = ANY (${options.eventTypes}) `
            : sql` TRUE `,
        ),
    );

    const events = R.sortBy(
      results.map(({ payment, payer, event, debt }) => ({
        ...formatPaymentEvent({ ...event, time: parseISO(event.time as any) }),
        debt: formatDebt(debt),
        payer: formatPayerProfile(payer),
        payment: formatPayment({ ...payment, events: [] }),
      })),
      item => item.time,
    );

    type EventDetails = (typeof events)[0];

    let groups;

    if (options.groupBy) {
      let getGroupKey;
      let getGroupDetails;

      if (options.groupBy === 'center') {
        getGroupKey = (event: EventDetails) => event.debt.debtCenterId;
        getGroupDetails = async (id: string) => {
          const center = await bus.exec(getDebtCenter, id);
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

      const createGroupUsing =
        (
          nameResolver: (
            id: string,
            rows: EventDetails[],
          ) => Promise<{ name: string; id: string }>,
        ) =>
        ([key, events]: [string, EventDetails[]]) =>
        async () => {
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

    let name = `Payment Ledger ${format(
      options.startDate,
      'dd.MM.yyyy',
    )} - ${format(options.endDate, 'dd.MM.yyyy')}`;

    if (options.paymentType) {
      name =
        options.paymentType[0].toUpperCase() +
        options.paymentType.substring(1) +
        ' ' +
        name;
    }

    return bus.exec(createReport, {
      template: 'payment-ledger',
      name,
      options,
      payload: { options, groups },
      parent,
      generatedBy,
    });
  }

  bus.register(defs.deletePaymentEvent, async id => {
    await pg.any(sql`
      DELETE FROM payment_event_transaction_mapping WHERE payment_event_id = ${id}
    `);

    const row = await pg.one<DbPaymentEvent>(sql`
      DELETE FROM payment_events WHERE id = ${id} RETURNING *
    `);

    return row && formatPaymentEvent(row);
  });

  bus.register(defs.updatePaymentEvent, async ({ id, amount }) => {
    const paymentEvent = await pg.one<DbPaymentEvent>(sql`
      UPDATE payment_events
      SET amount = COALESCE(${amount.value}, amount)
      WHERE id = ${id}
      RETURNING *
    `);

    return paymentEvent && formatPaymentEvent(paymentEvent);
  });
};
