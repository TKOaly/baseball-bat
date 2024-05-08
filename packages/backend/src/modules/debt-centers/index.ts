import { DbDebtCenter, DebtCenter } from '@bbat/common/build/src/types';
import accountingIface from '../accounting/definitions';
import sql, { SQLStatement } from 'sql-template-strings';
import { cents } from '@bbat/common/build/src/currency';
import * as E from 'fp-ts/Either';
import routes from './api';
import * as defs from './definitions';
import { pipe } from 'fp-ts/function';
import { createModule } from '@/module';
import { logEvent } from '../audit/definitions';

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

export default createModule({
  name: 'debtCenters',

  routes,

  async setup({ bus }) {
    const debtCenterQuery = (where: SQLStatement) =>
      sql`
      WITH counts AS (
        SELECT 
          d.debt_center_id AS id,
          COUNT(d.id) as debt_count,
          COUNT(d.id) FILTER (WHERE ds.is_paid) AS paid_count,
          COUNT(d.id) FILTER (WHERE NOT ds.is_paid) AS unpaid_count
        FROM debt d
        LEFT JOIN debt_statuses ds USING (id) 
        GROUP BY d.debt_center_id
      ),
      amounts AS (
        SELECT
          d.debt_center_id AS id,
          SUM(dco.amount) AS total,
          COALESCE(SUM(dco.amount) FILTER (WHERE ds.is_paid), 0) AS paid_total
        FROM debt d
        LEFT JOIN debt_statuses ds USING (id)
        LEFT JOIN debt_component_mapping dcm ON dcm.debt_id = d.id
        LEFT JOIN debt_component dco ON dco.id = dcm.debt_component_id
        GROUP BY d.debt_center_id
      )
      SELECT DISTINCT ON (dc.id)
        dc.*,
        counts.*,
        amounts.*
      FROM debt_center dc
      LEFT JOIN counts USING (id)
      LEFT JOIN amounts USING (id)
      WHERE
    `.append(where);

    bus.register(defs.getDebtCenters, async (_, { pg }) => {
      return pg
        .many<DbDebtCenter>(debtCenterQuery(sql`NOT dc.deleted`))
        .then(dbDebtCenters => dbDebtCenters.map(formatDebtCenter));
    });

    bus.register(defs.getDebtCenterByName, async (name, { pg }) => {
      const dbDebtCenter = await pg.one<DbDebtCenter>(
        debtCenterQuery(sql`name = ${name} AND NOT deleted`),
      );

      return dbDebtCenter && formatDebtCenter(dbDebtCenter);
    });

    bus.register(defs.getDebtCenter, async (id, { pg }) => {
      const dbDebtCenter = await pg.one<DbDebtCenter>(
        debtCenterQuery(sql`id = ${id} AND NOT deleted`),
      );

      return dbDebtCenter && formatDebtCenter(dbDebtCenter);
    });

    bus.register(defs.createDebtCenter, async (center, { pg }, bus) => {
      const accounting = bus.getInterface(accountingIface);

      const isAccountingPeriodOpenResult = accounting.isAccountingPeriodOpen(
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

      await bus.exec(logEvent, {
        type: 'debt-center.create',
        links: [
          {
            type: 'center',
            label: result.name,
            target: {
              type: 'debt-center',
              id: result.id,
            },
          },
        ],
      });

      return result;
    });

    bus.register(defs.deleteDebtCenter, async (id, { pg }, bus) => {
      const center = await bus.exec(defs.getDebtCenter, id);

      if (!center) {
        return null;
      }

      await pg.one<DbDebtCenter>(sql`
        UPDATE debt_center SET deleted = TRUE WHERE id = ${id} RETURNING id
      `);

      await bus.exec(logEvent, {
        type: 'debt-center.delete',
        links: [{
          type: 'center',
          label: center.name,
          target: {
            type: 'debt-center',
            id: center.id,
          },
        }],
      });

      return center;
    });

    bus.register(defs.updateDebtCenter, async (center, { pg }, bus) => {
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
  },
});
