import {
  DbDebt,
  DbDebtCenter,
  DbDebtComponent,
  DbDebtTag,
  DbPayerProfile,
  Debt,
  DebtCenter,
  DebtComponent,
  DebtTag,
  PayerProfile,
  euro,
  internalIdentity,
} from '@bbat/common/types';
import { sql } from '@/db/template';
import { addDays } from 'date-fns';
import { formatDebtCenter } from '../debt-centers';
import { formatPayerProfile } from '../payers/query';
import { cents } from '@bbat/common/currency';
import { defineQuery } from '@/db/pagination';

const formatDebtTag = (tag: DbDebtTag): DebtTag => ({
  name: tag.name,
  hidden: tag.hidden,
});

const resolveDueDate = (debt: DbDebt) => {
  if (debt.due_date) {
    return debt.due_date;
  }

  if (debt.published_at && debt.payment_condition !== null) {
    return addDays(debt.published_at, debt.payment_condition);
  }

  return null;
};

export const formatDebt = (
  debt: DbDebt & {
    payer?: [DbPayerProfile] | DbPayerProfile;
    debt_center?: DbDebtCenter;
    debt_components?: DbDebtComponent[];
    total?: number;
  },
): Debt & {
  payer?: PayerProfile;
  debtCenter?: DebtCenter;
  debtComponents: Array<DebtComponent>;
} => ({
  name: debt.name,
  id: debt.id,
  humanId: debt.human_id,
  accountingPeriod: debt.accounting_period,
  date: debt.date,
  lastReminded: debt.last_reminded,
  payerId: internalIdentity(debt.payer_id),
  createdAt: debt.created_at,
  updatedAt: debt.updated_at,
  draft: debt.published_at === null,
  description: debt.description,
  dueDate: resolveDueDate(debt),
  publishedAt: debt.published_at,
  publishedBy: debt.published_by ? internalIdentity(debt.published_by) : null,
  creditedAt: debt.credited_at,
  creditedBy: debt.credited_by ? internalIdentity(debt.credited_by) : null,
  debtCenterId: debt.debt_center_id,
  defaultPayment: debt.default_payment,
  debtCenter: debt.debt_center && formatDebtCenter(debt.debt_center),
  credited: debt.credited,
  total: debt.total === undefined ? cents(0) : cents(debt.total),
  paymentCondition: debt.payment_condition,
  debtComponents: debt.debt_components
    ? debt.debt_components.filter(c => c !== null).map(formatDebtComponent)
    : [],
  payer:
    debt.payer &&
    (Array.isArray(debt.payer)
      ? formatPayerProfile(debt.payer[0])
      : formatPayerProfile(debt.payer)),
  status: debt.status,
  tags: (debt.tags ?? []).map(formatDebtTag),
  markedAsPaid: debt.marked_as_paid ?? null,
  paymentOptions: debt.payment_options ?? null,
});

export const formatDebtComponent = (
  debtComponent: DbDebtComponent,
): DebtComponent => ({
  id: debtComponent.id,
  name: debtComponent.name,
  amount: euro(debtComponent.amount / 100),
  description: debtComponent.description ?? '',
  debtCenterId: debtComponent.debt_center_id,
  createdAt: null,
  updatedAt: null,
});

export const queryDebts = defineQuery({
  map: formatDebt,
  paginateBy: 'human_id',
  filters: {
    status: {
      is_overdue: (_lhs, _rhs) =>
        sql`published_at IS NOT NULL AND due_date IS NOT NULL AND due_date <= NOW() AND status = 'unpaid'`,
      is_not_overdue: (_lhs, _rhs) =>
        sql`published_at IS NULL OR due_date IS NULL OR due_date > NOW() OR status <> 'unpaid'`,
    },
  },
  query: sql`
    WITH components AS (
      SELECT
        d.id,
        ARRAY_AGG(TO_JSON(dc.*)) AS debt_components,
        COALESCE(SUM(dc.amount), 0) AS total
      FROM debt d
      LEFT JOIN debt_component_mapping ON debt_component_mapping.debt_id = d.id
      LEFT JOIN debt_component dc ON debt_component_mapping.debt_component_id = dc.id
      GROUP BY d.id
    ),
    tags AS (
      SELECT t.debt_id AS id, ARRAY_AGG(TO_JSONB(t.*)) tags FROM debt_tags t GROUP BY id
    )
    SELECT
      debt.id AS cursor_id,
      debt.*,
      components.total,
      components.debt_components,
      tags.tags,
      payer_profiles.name AS payer_name,
      TO_JSON(payer_profiles.*) AS payer,
      TO_JSON(debt_center.*) AS debt_center,
      ds.is_paid,
      CASE WHEN ds.is_paid THEN 'paid' ELSE 'unpaid' END AS status
    FROM debt
    LEFT JOIN components USING (id)
    LEFT JOIN tags USING (id)
    LEFT JOIN debt_statuses ds USING (id)
    LEFT JOIN payer_profiles ON payer_profiles.id = debt.payer_id
    LEFT JOIN debt_center ON debt_center.id = debt.debt_center_id
  `,
});
