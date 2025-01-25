import { defineQuery } from '@/db/pagination';
import { sql } from '@/db/template';
import { cents } from '@bbat/common/currency';
import {
  DbPayerEmail,
  DbPayerProfile,
  PayerEmail,
  PayerProfile,
  internalIdentity,
  tkoalyIdentity,
} from '@bbat/common/types';

export const formatPayerProfile = (
  profile: DbPayerProfile & { emails?: DbPayerEmail[] },
): PayerProfile => ({
  id: internalIdentity(profile.id),
  tkoalyUserId: !profile.tkoaly_user_id
    ? null
    : tkoalyIdentity(profile.tkoaly_user_id),
  primaryEmail: profile.primary_email ?? null,
  name: profile.name,
  createdAt: profile.created_at,
  updatedAt: profile.updated_at,
  disabled: profile.disabled,
  mergedTo: !profile.merged_to ? null : internalIdentity(profile.merged_to),
  emails: profile.emails ? profile.emails.map(formatPayerEmail) : [],
  debtCount: profile.debt_count ?? null,
  paidCount: profile.paid_count ?? null,
  unpaidCount: profile.unpaid_count ?? null,
  total: profile.total === null ? null : cents(parseInt('' + profile.total)),
  unpaidValue: profile.unpaid_value ? cents(profile.unpaid_value) : null,
  totalPaid:
    profile.total_paid === null
      ? null
      : cents(parseInt('' + profile.total_paid)),
  paidRatio: profile.paid_ratio as any,
});

export const formatPayerEmail = (email: DbPayerEmail): PayerEmail => ({
  payerId: internalIdentity(email.payer_id),
  email: email.email,
  priority: email.priority,
  source: email.source,
  createdAt: email.created_at,
  updatedAt: email.updated_at,
});

export const payerQuery = defineQuery({
  paginateBy: 'id',

  map: formatPayerProfile,

  query: sql`
    WITH counts AS (
      SELECT
        d.payer_id,
        COUNT(DISTINCT d.id) FILTER (WHERE d.published_at IS NOT NULL AND NOT d.credited) AS debt_count,
        COUNT(DISTINCT d.id) FILTER (WHERE ds.is_paid) AS paid_count,
        COUNT(DISTINCT d.id) FILTER (WHERE NOT ds.is_paid AND d.published_at IS NOT NULL AND NOT d.credited) AS unpaid_count
      FROM debt d
      JOIN debt_statuses ds USING (id)
      GROUP BY d.payer_id
    ), totals AS (
      SELECT
        d.payer_id,
        COALESCE(SUM(dco.amount) FILTER (WHERE d.published_at IS NOT NULL AND NOT d.credited), 0) AS total,
        COALESCE(SUM(dco.amount) FILTER (WHERE ds.is_paid), 0) AS total_paid,
        COALESCE(SUM(dco.amount) FILTER (WHERE NOT ds.is_paid AND d.published_at IS NOT NULL AND NOT d.credited), 0) AS unpaid_value
      FROM debt d
      LEFT JOIN debt_statuses ds ON ds.id = d.id
      LEFT JOIN debt_component_mapping dcm ON dcm.debt_id = d.id
      LEFT JOIN debt_component dco ON dco.id = dcm.debt_component_id
      GROUP BY d.payer_id
    ), emails AS (
      SELECT
        e.payer_id,
        ARRAY_AGG(TO_JSON(e.*)) AS emails,
        ARRAY_AGG(e.email) FILTER (WHERE e.priority = 'primary') primary_emails
      FROM payer_emails e
      GROUP BY e.payer_id
    )
    SELECT
      pp.*,
      COALESCE(totals.total, 0) AS total,
      COALESCE(totals.total_paid, 0) AS total_paid,
      COALESCE(totals.unpaid_value, 0) AS unpaid_value,
      CASE
        WHEN totals.total > 0 THEN
          COALESCE(totals.total_paid::float, 0) / totals.total::float
        ELSE 0
      END AS paid_ratio,
      COALESCE(counts.debt_count, 0) AS debt_count,
      COALESCE(counts.paid_count, 0) AS paid_count,
      COALESCE(counts.unpaid_count, 0) AS unpaid_count,
      emails.*,
      (SELECT email FROM payer_emails WHERE payer_id = pp.id AND priority = 'primary') AS primary_email
    FROM payer_profiles pp
    LEFT JOIN counts ON pp.id = counts.payer_id
    LEFT JOIN totals ON pp.id = totals.payer_id
    LEFT JOIN emails ON pp.id = emails.payer_id
  `,
});
