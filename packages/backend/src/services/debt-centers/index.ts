import { DbDebtCenter, DebtCenter } from '@bbat/common/build/src/types';
import { isAccountingPeriodOpen } from '../accounting/definitions';
import sql from 'sql-template-strings';
import { cents } from '@bbat/common/build/src/currency';
import * as E from 'fp-ts/lib/Either';
import { ModuleDeps } from '@/app';
import * as defs from './definitions';
import { pipe } from 'fp-ts/lib/function';

export const formatDebtCenter = (debtCenter: DbDebtCenter): DebtCenter => ({
  id: debtCenter.id,
  humanId: debtCenter.human_id,
  accountingPeriod: debtCenter.accounting_period,
  name: debtCenter.name,
  description: debtCenter.description,
  createdAt: debtCenter.created_at,
  updatedAt: debtCenter.updated_at,
  debtCount: debtCenter.debt_count ?? null,
  paidCount: debtCenter.paid_count ?? null,
  unpaidCount: debtCenter.unpaid_count ?? null,
  total:
    debtCenter.total === undefined
      ? null
      : cents(parseInt('' + debtCenter.total)),
  url: debtCenter.url,
});

export default ({ pg, bus }: ModuleDeps) => {
  bus.register(defs.getDebtCenters, async () => {
    return pg
      .any<DbDebtCenter>(
        sql`
        SELECT
          dc.*,
          COUNT(d.id) as debt_count,
          COUNT(d.id) FILTER (WHERE ds.is_paid) AS paid_count,
          COUNT(d.id) FILTER (WHERE NOT ds.is_paid) AS unpaid_count,
          SUM(dco.amount) AS total,
          COALESCE(SUM(dco.amount) FILTER (WHERE ds.is_paid), 0) AS paid_total
        FROM debt_center dc
        LEFT JOIN debt d ON d.debt_center_id = dc.id
        LEFT JOIN debt_statuses ds ON ds.id = d.id
        LEFT JOIN debt_component_mapping dcm ON dcm.debt_id = d.id
        LEFT JOIN debt_component dco ON dco.id = dcm.debt_component_id
        WHERE NOT dc.deleted
        GROUP BY dc.id
      `,
      )
      .then(dbDebtCenters => dbDebtCenters.map(formatDebtCenter));
  });

  bus.register(defs.getDebtCenterByName, name => {
    return pg
      .one<DbDebtCenter>(
        sql`SELECT * FROM debt_center WHERE name = ${name} AND NOT deleted`,
      )
      .then(dbDebtCenters => dbDebtCenters && formatDebtCenter(dbDebtCenters));
  });

  bus.register(defs.getDebtCenter, async id => {
    return pg
      .one<DbDebtCenter>(
        sql`SELECT * FROM debt_center WHERE id = ${id} AND NOT deleted`,
      )
      .then(dbDebtCenters => dbDebtCenters && formatDebtCenter(dbDebtCenters));
  });

  bus.register(defs.createDebtCenter, async (center, _, bus) => {
    const isAccountingPeriodOpenResult = await bus.exec(
      isAccountingPeriodOpen,
      center.accountingPeriod,
    );

    if (!isAccountingPeriodOpenResult) {
      throw new Error(
        `Accounting period ${center.accountingPeriod} is not open.`,
      );
    }

    const result = await pg
      .one<DbDebtCenter>(
        sql`
        INSERT INTO debt_center (name, url, description, accounting_period)
        VALUES (
          ${center.name},
          ${center.url},
          ${center.description},
          ${center.accountingPeriod}
        )
        RETURNING *
      `,
      )
      .then(dbDebtCenter => dbDebtCenter && formatDebtCenter(dbDebtCenter));

    if (!result) {
      throw new Error('Failed to create debt center!');
    }

    return result;
  });

  bus.register(defs.deleteDebtCenter, async id => {
    const center = await pg.one<DbDebtCenter>(sql`
        UPDATE debt_center SET deleted = TRUE WHERE id = ${id} RETURNING id
      `);

    return center && formatDebtCenter(center);
  });

  bus.register(defs.updateDebtCenter, async (center, _, bus) => {
    const existing = await bus.exec(defs.getDebtCenter, center.id);

    if (!existing) {
      return E.left(new Error('No such debt center'));
    }

    const query = sql`
      UPDATE debt_center
      SET
        name = ${center.name},
        description = ${center.description},
        url = ${center.url}
      WHERE
        id = ${center.id}
      RETURNING *
    `;

    const result = await pg.one<DbDebtCenter>(query);

    return pipe(E.fromNullable(null)(result), E.map(formatDebtCenter));
  });
};
