import { defineQuery } from '@/db/pagination';
import { sql } from '@/db/template';
import { cents } from '@bbat/common/currency';
import { BankTransaction, DbBankTransaction } from '@bbat/common/types';
import { parseISO } from 'date-fns/parseISO';
import { formatPayment } from '../payments';

export const formatBankTransaction = (
  tx: DbBankTransaction,
): BankTransaction => ({
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

export const transactionQuery = defineQuery<DbBankTransaction, BankTransaction>(
  {
    paginateBy: 'id',

    map: formatBankTransaction,

    query: sql`
    WITH payments AS  (
      SELECT
        ARRAY_AGG(TO_JSONB(ps.*)) payments,
        COUNT(*) payment_count,
        ps.bank_transaction_id
      FROM (
        SELECT
          p.*,
          s.balance,
          s.status,
          s.payer,
          petm.bank_transaction_id,
          (SELECT -amount FROM payment_events WHERE payment_id = p.id AND type = 'created') AS initial_amount,
          (SELECT s.time FROM (SELECT time, SUM(amount) OVER (ORDER BY TIME) balance FROM payment_events WHERE payment_id = p.id) s WHERE balance >= 0 ORDER BY time LIMIT 1) AS paid_at,
          (SELECT payer_id FROM payment_debt_mappings pdm JOIN debt d ON pdm.debt_id = d.id WHERE pdm.payment_id = p.id LIMIT 1) AS payer_id,
          (SELECT ARRAY_AGG(TO_JSON(payment_events.*)) FROM payment_events WHERE payment_id = p.id) AS events,
          COALESCE(s.updated_at, p.created_at) AS updated_at
        FROM payment_event_transaction_mapping petm
        JOIN payment_events pe ON pe.id = petm.payment_event_id
        JOIN payments p ON pe.payment_id = p.id
        JOIN payment_statuses s ON s.id = p.id
      ) ps
      GROUP BY ps.bank_transaction_id
    )
    SELECT bt.*, payments.*
    FROM bank_transactions bt
    LEFT JOIN payments ON bt.id = payments.bank_transaction_id 
  `,
  },
);
