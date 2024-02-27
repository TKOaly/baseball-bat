import { Connection } from '@/db';
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
import sql, { SQLStatement } from 'sql-template-strings';
import { formatPayerProfile } from '../payers';
import { addDays } from 'date-fns';
import { formatDebtCenter } from '../debt-centers';
import { cents } from '@bbat/common/currency';

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

export async function queryDebts(
  pg: Connection,
  where?: SQLStatement,
): Promise<Array<Debt>> {
  let query = sql`
    SELECT
      debt.*,
      TO_JSON(payer_profiles.*) AS payer,
      TO_JSON(debt_center.*) AS debt_center,
      CASE WHEN ( SELECT is_paid FROM debt_statuses ds WHERE ds.id = debt.id ) THEN 'paid' ELSE 'unpaid' END AS status,
      ARRAY_AGG(TO_JSON(debt_component.*)) AS debt_components,
      COALESCE((
        SELECT SUM(dc.amount) AS total
        FROM debt_component_mapping dcm
        JOIN debt_component dc ON dc.id = dcm.debt_component_id
        WHERE dcm.debt_id = debt.id
      ), 0) AS total,
      (SELECT ARRAY_AGG(TO_JSONB(debt_tags.*)) FROM debt_tags WHERE debt_tags.debt_id = debt.id) AS tags
    FROM debt
    JOIN payer_profiles ON payer_profiles.id = debt.payer_id
    JOIN debt_center ON debt_center.id = debt.debt_center_id
    LEFT JOIN debt_component_mapping ON debt_component_mapping.debt_id = debt.id
    LEFT JOIN debt_component ON debt_component_mapping.debt_component_id = debt_component.id
  `;

  if (where) {
    query = query.append(' WHERE ').append(where).append(' ');
  }

  query = query.append(sql`GROUP BY debt.id, payer_profiles.*, debt_center.*`);

  return pg.many<DbDebt>(query).then(debts => debts.map(formatDebt));
}
