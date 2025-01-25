import { defineQuery } from '@/db/pagination';
import { sql } from '@/db/template';
import { cents } from '@bbat/common/currency';
import {
  DbPayment,
  DbPaymentEvent,
  Payment,
  PaymentEvent,
} from '@bbat/common/types';
import { parseISO } from 'date-fns/parseISO';

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

export const paymentsQuery = defineQuery<DbPayment, Payment>({
  paginateBy: 'id',

  map: formatPayment,

  query: sql`
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
      INNER JOIN debt d ON pdm.debt_id = d.id
      INNER JOIN payer_profiles pp ON pp.id = d.payer_id
      WHERE pdm.payment_id = p.id
    ) aggs ON true
  `,
});
