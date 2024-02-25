import sql from 'sql-template-strings';
import {
  DbPayment,
  DbPaymentEvent,
  EuroValue,
  Payment,
  PaymentEvent,
  PaymentStatus,
} from '@bbat/common/build/src/types';
import { Connection } from '../../db';
import { cents, euro, sumEuroValues } from '@bbat/common/build/src/currency';
import { ModuleDeps } from '@/app';
import * as payerService from '@/services/payers/definitions';
import * as debtService from '@/services/debts/definitions';
import * as defs from './definitions';
import { createEmail, sendEmail } from '../email/definitions';
import { parseISO } from 'date-fns';

export class RegistrationError extends Error {}

export type PaymentCreditReason = 'manual' | 'paid';

type PaymentWithEvents = Payment & {
  events: Array<{
    time: Date;
    data: Record<string, unknown>;
    type: 'created' | 'payment';
    amount: EuroValue;
  }>;
};

export function formatReferenceNumber(reference: string) {
  return reference.match(/.{1,4}/g)?.join?.(' ') ?? reference;
}

const mapDate = (value: Date | string): Date =>
  typeof value === 'string' ? parseISO(value) : value;

const formatPaymentEvent = (db: DbPaymentEvent): PaymentEvent => ({
  id: db.id,
  paymentId: db.payment_id,
  type: db.type,
  amount: cents(db.amount),
  time: mapDate(db.time),
  data: db.data as any,
});

export type NewStripePayment = {
  debts: string[];
};

export type StripePaymentResult = {
  payment: Payment;
  clientSecret: string;
};

export const formatPayment = (db: DbPayment): Payment => ({
  id: db.id,
  humanId: db.human_id,
  humanIdNonce: db.human_id_nonce ?? null,
  accountingPeriod: db.accounting_period,
  type: db.type,
  title: db.title,
  paymentNumber: db.payment_number,
  data: db.data,
  message: db.message,
  balance: cents(db.balance),
  status: db.status,
  updatedAt: mapDate(db.updated_at),
  createdAt: mapDate(db.created_at),
  credited: db.credited,
  events: db.events.map(formatPaymentEvent),
});

export default ({ bus }: ModuleDeps) => {
  bus.register(defs.getPayments, async (_, { pg }) => {
    const payments = await pg.many<DbPayment>(sql`
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
  });

  bus.register(defs.getPayment, async (id, { pg }) => {
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
  });

  async function getPaymentsByReferenceNumbers(pg: Connection, rfs: string[]) {
    const payments = await pg.many<PaymentWithEvents>(sql`
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

  /*async function onPaymentPaid(
    bus: ExecutionContext<BusContext>,
    id: string,
    _event: PaymentEvent,
  ) {
    const payment = await bus.exec(defs.getPayment, id);
    const debts = await bus.exec(debtService.getDebtsByPayment, id);

    if (!payment) {
      return;
    }

    await Promise.all(
      debts.map(debt =>
        bus.exec(debtService.onDebtPaid, { debt, payment }),
      ),
    );
  }*/

  bus.register(
    defs.createPaymentEvent,
    async ({ paymentId: id, ...event }, { pg }, bus) => {
      // const [created, oldStatus, newStatus] = await pg.tx(async tx => {

      // eslint-disable-next-line
      const { status: oldStatus } = (await pg.one<{
        status: PaymentStatus;
      }>(sql`
      SELECT status FROM payment_statuses WHERE id = ${id}
    `))!;

      const created = await pg.one<DbPaymentEvent>(sql`
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
        await pg.do(sql`
        INSERT INTO payment_event_transaction_mapping (payment_event_id, bank_transaction_id)
        VALUES (${created.id}, ${event.transaction})
      `);
      }

      const statusRow = await pg.one<{
        status: PaymentStatus;
      }>(sql`
      SELECT status FROM payment_statuses WHERE id = ${id}
    `);

      if (!statusRow) {
        throw new Error('Failed to fetch payment status!');
      }

      const newStatus = statusRow.status;

      // })

      const createdEvent = formatPaymentEvent(created);

      // eslint-disable-next-line
      const newPayment = (await bus.exec(defs.getPayment, id))!;

      if (event.amount.value !== 0) {
        await bus.emit(defs.onBalanceChanged, {
          paymentId: id,
          balance: newPayment.balance,
        });
      }

      if (oldStatus !== newStatus) {
        await bus.emit(defs.onStatusChanged, {
          paymentId: id,
          status: newStatus,
        });
      }

      return createdEvent;
    },
  );

  bus.register(defs.getPaymentsByData, async (data, { pg }) => {
    const payments = await pg.many<DbPayment>(sql`
      SELECT
        p.*,
        s.balance,
        s.status,
        s.payer,
        s.payer->>'id' AS payer_id,
        (SELECT ARRAY_AGG(TO_JSON(payment_events.*)) FROM payment_events WHERE payment_id = p.id) AS events,
        COALESCE(s.updated_at, p.created_at) AS updated_at
      FROM payments p
      JOIN payment_statuses s ON s.id = p.id
      WHERE p.data @> (${data})
    `);

    return payments.map(formatPayment);
  });

  bus.register(
    defs.createPaymentEventFromTransaction,
    async ({ transaction: tx, amount, paymentId }, { pg }, bus) => {
      let payment;

      if (paymentId) {
        payment = await bus.exec(defs.getPayment, paymentId);
      } else if (tx.reference) {
        [payment] = await getPaymentsByReferenceNumbers(pg, [tx.reference]);
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

  bus.register(defs.getPayerPayments, async (id, { pg }) => {
    const payments = await pg.many<DbPayment>(sql`
        SELECT
          p.*,
          s.balance,
          s.status,
          s.payer,
          s.payer->>'id' AS payer_id,
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

  bus.register(defs.getPaymentsContainingDebt, async (debtId, { pg }) => {
    const payments = await pg.many<DbPayment>(sql`
        SELECT
          p.*,
          s.balance,
          s.status,
          s.payer,
          s.payer->>'id' AS payer_id,
          (SELECT ARRAY_AGG(TO_JSON(payment_events.*)) FROM payment_events WHERE payment_id = p.id) AS events,
          COALESCE(s.updated_at, p.created_at) AS updated_at
        FROM payments p
        JOIN payment_statuses s ON s.id = p.id
        JOIN payment_debt_mappings pdm ON pdm.payment_id = p.id
        WHERE pdm.debt_id = ${debtId}
      `);

    return payments.map(formatPayment);
  });

  bus.register(defs.getDefaultInvoicePaymentForDebt, async (debtId, { pg }) => {
    const payment = await pg.one<DbPayment>(sql`
        SELECT
          p.*,
          s.balance,
          s.status,
          s.payer,
          s.payer->>'id' AS payer_id,
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

  /*async function logPaymentEvent(
    pg: Connection,
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
  }*/

  /*async function updatePaymentData(
    pg: Connection,
    id: string,
    data: Record<string, unknown>,
  ) {
    pg.do(sql`
      UPDATE payments SET data = ${data} WHERE id = ${id}
    `);
  }*/

  /*bus.register(
    defs.createInvoice,
    async ({ invoice, options }, { pg }, bus) => {
      console.log('Getting debts!');

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

      console.log('Due date', debts[0].dueDate);

      const due_date = due_dates[0];

      const amount = debts.map(debt => debt.total).reduce(sumEuroValues, euro(0));

      const payment = await bus.exec(defs.createPayment, {
        payment: {
          type: 'invoice',
          message: invoice.message,
          amount,
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
        date: formatISO(invoice.date ?? new Date()),
      };

      await updatePaymentData(pg, payment.id, data);

      return {
        ...payment,
        data,
      };
    },
  );*/

  /*bus.register(defs.createStripePayment, async (options, _, bus) => {
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

    let payment = await bus.exec(defs.getPayment, id);

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

    payment = await bus.exec(defs.getPayment, id);

    if (payment === null) {
      throw new Error('Failed to create payment.');
    }

    return {
      payment,
      clientSecret: intent.client_secret,
    };
  });*/

  bus.register(
    defs.createPayment,
    async ({ payment, defer, options = {} }, { pg }, bus) => {
      // const created = await pg.tx(async tx => {
      //
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const { id: createdPaymentId } = (await pg.one<DbPayment>(sql`
        INSERT INTO payments (type, data, message, title, created_at)
        VALUES (
          ${payment.type},
          ${payment.data},
          ${payment.message},
          ${payment.title},
          COALESCE(${payment.createdAt}, NOW())
        )
        RETURNING id
      `))!;

      await pg.do(sql`
        INSERT INTO payment_events (payment_id, type, amount)
        VALUES (${createdPaymentId}, 'created', ${-payment.amount.value})
      `);

      const iface = bus.getInterface(defs.paymentTypeIface, payment.type);

      const data = await iface.createPayment({
        paymentId: createdPaymentId,
        options,
      });

      await pg.do(
        sql`UPDATE payments SET data = ${data} WHERE id = ${createdPaymentId}`,
      );

      /*await Promise.all(
        payment.debts.map(debt =>
          pg.do(sql`
            INSERT INTO payment_debt_mappings (payment_id, debt_id)
            VALUES (${createdPaymentId}, ${debt})
          `),
        ),
      );

      const { total } = await pg.one<{ total: number }>(sql`
        SELECT SUM(c.amount) AS total
        FROM debt_component_mapping m
        JOIN debt_component c ON c.id = m.debt_component_id
        WHERE m.debt_id = ANY (${payment.debts})
      `);*/

      //const formated = formatPayment(createdPayment as any) as any;

      //console.log(formated)

      if (!defer) {
        await bus.exec(defs.finalizePayment, createdPaymentId);
      }

      const created = await bus.exec(defs.getPayment, createdPaymentId);

      if (!created) {
        throw new Error('Failed to retrieve the created payment!');
      }

      // return created;
      // });

      return created;
    },
  );

  bus.register(defs.creditPayment, async ({ id, reason }, { pg }, bus) => {
    const payment = await bus.exec(defs.getPayment, id);

    if (!payment) {
      throw new Error('Payment not found');
    }

    const debts = await bus.exec(debtService.getDebtsByPayment, id);

    if (debts.length === 0) {
      throw new Error('Payment is not associated with a debt!');
    }

    const payerId = debts[0].payerId;

    const payer = await bus.exec(
      payerService.getPayerProfileByInternalIdentity,
      payerId,
    );

    const email = await bus.exec(payerService.getPayerPrimaryEmail, payerId);

    const amount = debts.map(debt => debt.total).reduce(sumEuroValues, euro(0));

    await pg.do(sql`
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

    return bus.exec(defs.getPayment, id);
  });

  bus.register(defs.getPaymentEvent, async (id, { pg }) => {
    const row = await pg.one<DbPaymentEvent>(sql`
      SELECT * FROM payment_events WHERE id = ${id}
    `);

    return row && formatPaymentEvent(row);
  });

  /*async function createBankTransactionPaymentEvent(
    pg: Connection,
    bus: ExecutionContext<BusContext>,
    details: BankTransactionDetails,
  ) {
    const payments = await getPaymentsByReferenceNumbers(pg, [
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
  }*/

  /*bus.register(defs.sendNewPaymentNotification, async (id, _, bus) => {
    const payment = await bus.exec(defs.getPayment, id);

    if (!payment) {
      return E.left('No such payment');
    }

    const debts = await bus.exec(debtService.getDebtsByPayment, id);
    const payerId = debts[0].payerId;
    const total = debts.map(debt => debt.total).reduce(sumEuroValues, euro(0));
    const payer = await bus.exec(
      payerService.getPayerProfileByInternalIdentity,
      payerId,
    );
    const email = await bus.exec(
      payerService.getPayerPrimaryEmail,
      payerId,
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
  });*/

  /*async function generatePaymentLedger(
    pg: Connection,
    bus: ExecutionContext<BusContext>,
    options: Omit<PaymentLedgerOptions, 'startDate' | 'endDate'> &
      Record<'startDate' | 'endDate', Date>,
    generatedBy: InternalIdentity,
    parent?: string,
  ) {
    const results = await pg.many<{
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
  }*/

  bus.register(defs.deletePaymentEvent, async (id, { pg }) => {
    await pg.do(sql`
      DELETE FROM payment_event_transaction_mapping WHERE payment_event_id = ${id}
    `);

    const row = await pg.one<DbPaymentEvent>(sql`
      DELETE FROM payment_events WHERE id = ${id} RETURNING *
    `);

    return row && formatPaymentEvent(row);
  });

  bus.register(defs.updatePaymentEvent, async ({ id, amount }, { pg }) => {
    const paymentEvent = await pg.one<DbPaymentEvent>(sql`
      UPDATE payment_events
      SET amount = COALESCE(${amount.value}, amount)
      WHERE id = ${id}
      RETURNING *
    `);

    return paymentEvent && formatPaymentEvent(paymentEvent);
  });

  bus.register(defs.finalizePayment, async (paymentId, _, bus) => {
    await bus.emit(defs.onPaymentCreated, {
      paymentId,
    });
  });

  bus.provideNamed(defs.paymentTypeIface, 'cash', {
    async createPayment() {
      return {};
    },
  });
};
