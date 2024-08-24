import sql from 'sql-template-strings';
import {
  DbDebt,
  DbPayerProfile,
  DbPayment,
  DbPaymentEvent,
  Payment,
  PaymentEvent,
  PaymentStatus,
} from '@bbat/common/build/src/types';
import { cents, euro, sumEuroValues } from '@bbat/common/build/src/currency';
import routes from './api';
import * as payerService from '@/modules/payers/definitions';
import * as debtService from '@/modules/debts/definitions';
import * as defs from './definitions';
import { createEmail, sendEmail } from '../email/definitions';
import { format, parseISO } from 'date-fns';
import { createReport, reportTypeIface } from '../reports/definitions';
import * as t from 'io-ts';
import * as tt from 'io-ts-types';
import { pipe } from 'fp-ts/function';
import { groupBy } from 'fp-ts/NonEmptyArray';
import * as A from 'fp-ts/ReadonlyArray';
import * as T from 'fp-ts/Task';
import { isLeft } from 'fp-ts/Either';
import * as R from 'remeda';
import { formatDebt } from '../debts/query';
import { formatPayerProfile } from '../payers';
import { toArray } from 'fp-ts/Record';
import { getDebtCenter } from '../debt-centers/definitions';
import { createModule } from '@/module';
import { createPaginatedQuery } from '@/db/pagination';

export class RegistrationError extends Error {}

export type PaymentCreditReason = 'manual' | 'paid';

const paymentLedgerOptions = t.type({
  startDate: tt.DateFromISOString,
  endDate: tt.DateFromISOString,
  centers: t.union([t.null, t.array(t.string)]),
  eventTypes: t.union([
    t.null,
    t.array(
      t.union([
        t.literal('credited'),
        t.literal('created'),
        t.literal('payment'),
      ]),
    ),
  ]),
  groupBy: t.union([t.null, t.string]),
  paymentType: t.union([t.null, t.string]),
});

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
  paidAt: db.paid_at ? mapDate(db.paid_at) : null,
  type: db.type,
  title: db.title,
  paymentNumber: db.payment_number,
  data: db.data,
  message: db.message,
  initialAmount: cents(db.initial_amount ?? 0),
  balance: cents(db.balance),
  status: db.status,
  updatedAt: mapDate(db.updated_at),
  createdAt: mapDate(db.created_at),
  credited: db.credited,
  events: db.events.map(formatPaymentEvent),
  debts: db.debts ?? [],
  payers: db.payers ?? [],
});

const queryPayments = createPaginatedQuery<DbPayment>(
  sql`
    SELECT
      p.*,
      s.balance,
      s.status,
      s.payer,
      s.payer->>'name' AS payer_name,
      aggs.debts,
      aggs.debt_count,
      aggs.payers,
      (SELECT -amount FROM payment_events WHERE payment_id = p.id AND type = 'created') AS initial_amount,
      (SELECT s.time FROM (SELECT time, SUM(amount) OVER (ORDER BY TIME) balance FROM payment_events WHERE payment_id = p.id) s WHERE balance >= 0 ORDER BY time LIMIT 1) AS paid_at,
      (SELECT payer_id FROM payment_debt_mappings pdm JOIN debt d ON pdm.debt_id = d.id WHERE pdm.payment_id = p.id LIMIT 1) AS payer_id,
      (SELECT ARRAY_AGG(TO_JSON(payment_events.*)) FROM payment_events WHERE payment_id = p.id) AS events,
      COALESCE(s.updated_at, p.created_at) AS updated_at
    FROM payments p
    JOIN payment_statuses s ON s.id = p.id
    LEFT JOIN LATERAL (
      SELECT
        ARRAY_AGG(DISTINCT jsonb_build_object('id', d.id, 'name', d.name)) AS debts,
        COUNT(d.id) AS debt_count,
        ARRAY_AGG(DISTINCT jsonb_build_object('id', pp.id, 'name', pp.name)) AS payers
      FROM payment_debt_mappings pdm
      LEFT JOIN debt d ON pdm.debt_id = d.id
      LEFT JOIN payer_profiles pp ON pp.id = d.payer_id
      WHERE pdm.payment_id = p.id
    ) aggs ON true
  `,
  'id',
);

export default createModule({
  name: 'payments',

  routes,

  async setup({ bus }) {
    bus.register(defs.getPayments, async ({ cursor, sort, limit }, { pg }) =>
      queryPayments(pg, {
        limit,
        cursor,
        order: sort ? [[sort.column, sort.dir]] : undefined,
        map: formatPayment,
      }),
    );

    bus.register(defs.getPayment, async (id, { pg }) => {
      const { result } = await queryPayments(pg, {
        limit: 1,
        where: sql`id = ${id}`,
        map: formatPayment,
      });

      return result[0] ?? null;
    });

    bus.register(
      defs.createPaymentEvent,
      async ({ paymentId: id, ...event }, { pg }, bus) => {
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
      const { result } = await queryPayments(pg, {
        where: sql`data @> ${data}`,
        map: formatPayment,
      });

      return result;
    });

    bus.register(
      defs.createPaymentEventFromTransaction,
      async ({ transaction: tx, amount, paymentId }, _, bus) => {
        let payment;

        if (paymentId) {
          payment = await bus.exec(defs.getPayment, paymentId);
        } else if (tx.reference) {
          const normalized = tx.reference.replace(/^0+/, '');

          [payment] = await bus.exec(defs.getPaymentsByData, {
            reference_number: normalized,
          });
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
      const { result } = await queryPayments(pg, {
        where: sql`
          s.payer->>'id' = ${id.value} AND (
            SELECT every(d.published_at IS NOT NULL)
            FROM payment_debt_mappings pdm
            JOIN debt d ON d.id = pdm.debt_id
            WHERE pdm.payment_id = s.id
          )
        `,
        map: formatPayment,
      });

      return result;
    });

    bus.register(
      defs.getPaymentsContainingDebt,
      async ({ debtId, cursor, sort, limit }, { pg }) => {
        return queryPayments(pg, {
          where: sql`id IN (SELECT payment_id FROM payment_debt_mappings WHERE debt_id = ${debtId})`,
          limit,
          cursor,
          order: sort ? [[sort.column, sort.dir]] : undefined,
          map: formatPayment,
        });
      },
    );

    bus.register(
      defs.getDefaultInvoicePaymentForDebt,
      async (debtId, { pg }) => {
        const { result } = await queryPayments(pg, {
          where: sql`id = (SELECT default_payment FROM debt WHERE id = ${debtId})`,
          map: formatPayment,
        });

        return result[0];
      },
    );

    bus.register(
      defs.createPayment,
      async ({ payment, defer, options = {} }, { pg }, bus) => {
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

        if (!defer) {
          await bus.exec(defs.finalizePayment, createdPaymentId);
        }

        const created = await bus.exec(defs.getPayment, createdPaymentId);

        if (!created) {
          throw new Error('Failed to retrieve the created payment!');
        }

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

      const amount = debts
        .map(debt => debt.total)
        .reduce(sumEuroValues, euro(0));

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

      await bus.emit(defs.onStatusChanged, {
        paymentId: id,
        status: 'credited',
      });

      return bus.exec(defs.getPayment, id);
    });

    bus.register(defs.getPaymentEvent, async (id, { pg }) => {
      const row = await pg.one<DbPaymentEvent>(sql`
        SELECT * FROM payment_events WHERE id = ${id}
      `);

      return row && formatPaymentEvent(row);
    });

    bus.register(
      defs.generatePaymentLedger,
      async ({ options, parent }, { session }, bus) => {
        if (session?.authLevel !== 'authenticated') {
          throw new Error('Unauthenticated');
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
          parent: parent ?? undefined,
        });
      },
    );

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

    bus.provideNamed(reportTypeIface, 'payment-ledger', {
      async getDetails() {
        return {
          template: 'payment-ledger',
        };
      },

      async generate(args, { pg }, bus) {
        const result = paymentLedgerOptions.decode(args.options);

        if (isLeft(result)) {
          throw new Error('Invalid options!');
        }

        const options = result.right;

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
            ...formatPaymentEvent({
              ...event,
              time: parseISO(event.time as any),
            }),
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

        return { options, groups };
      },
    });
  },
});
