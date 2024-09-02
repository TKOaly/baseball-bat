import { BusContext } from '@/app';
import { Bus } from '@/bus';
import sql from 'sql-template-strings';
import { reportTypeIface } from '../reports/definitions';
import * as E from 'fp-ts/Either';
import * as A from 'fp-ts/Array';
import * as T from 'fp-ts/Task';
import * as t from 'io-ts';
import * as tt from 'io-ts-types';
import { DbDebt, Debt, Payment, internalIdentity } from '@bbat/common/types';
import { groupBy } from 'fp-ts/NonEmptyArray';
import { pipe } from 'fp-ts/function';
import { toArray } from 'fp-ts/Record';
import * as debtCentersService from '@/modules/debt-centers/definitions';
import * as payerService from '@/modules/payers/definitions';
import * as paymentService from '@/modules/payments/definitions';
import { queryDebts, formatDebt } from './query';

const debtLedgerOptions = t.type({
  startDate: tt.DateFromISOString,
  endDate: tt.DateFromISOString,
  centers: t.union([t.null, t.array(t.string)]),
  groupBy: t.union([t.null, t.literal('payer'), t.literal('center')]),
  includeDrafts: t.union([
    t.literal('include'),
    t.literal('exclude'),
    t.literal('only-drafts'),
  ]),
});

const debtStatusReportOptions = t.type({
  date: tt.DateFromISOString,
  centers: t.union([t.null, t.array(t.string)]),
  groupBy: t.union([t.null, t.literal('payer'), t.literal('center')]),
  includeOnly: t.union([
    t.null,
    t.literal('paid'),
    t.literal('credited'),
    t.literal('open'),
  ]),
});

export default (bus: Bus<BusContext>) => {
  bus.provideNamed(reportTypeIface, 'debt-ledger', {
    async getDetails() {
      return {
        template: 'debt-ledger',
      };
    },

    async generate(args, { pg }, bus) {
      const result = debtLedgerOptions.decode(args.options);

      if (E.isLeft(result)) {
        console.log(args.options);
        throw new Error('Invalid options!');
      }

      const options = result.right;

      let criteria;

      if (options.includeDrafts === 'include') {
        criteria = sql`date IS NULL OR date BETWEEN ${options.startDate} AND ${options.endDate}`;
      } else if (options.includeDrafts === 'exclude') {
        criteria = sql`published_at IS NOT NULL AND date BETWEEN ${options.startDate} AND ${options.endDate}`;
      } else {
        criteria = sql`published_at IS NULL AND created_at BETWEEN ${options.startDate} AND ${options.endDate}`;
      }

      if (options.centers !== null) {
        criteria = sql`(`
          .append(criteria)
          .append(sql`) AND (debt_center_id = ANY (${options.centers}))`);
      }

      const { result: debts } = await queryDebts(pg, { where: criteria });
      let groups;

      if (options.groupBy) {
        let getGroupKey;
        let getGroupDetails;

        if (options.groupBy === 'center') {
          getGroupKey = (debt: Debt) => debt.debtCenterId;
          getGroupDetails = async (id: string) => {
            const center = await bus.exec(debtCentersService.getDebtCenter, id);
            const name = center?.name ?? 'Unknown debt center';
            const displayId = center?.humanId ?? '???';
            return { name, id: displayId };
          };
        } else {
          getGroupKey = (debt: Debt) => debt.payerId.value;
          getGroupDetails = async (id: string) => {
            const payer = await bus.exec(
              payerService.getPayerProfileByInternalIdentity,
              internalIdentity(id),
            );
            const name = payer?.name ?? 'Unknown payer';
            const displayId = payer?.id?.value ?? '???';
            return { name, id: displayId };
          };
        }

        const createGroupUsing =
          (
            nameResolver: (id: string) => Promise<{ name: string; id: string }>,
          ) =>
          ([key, debts]: [string, Debt[]]) =>
          async () => {
            const { name, id } = await nameResolver(key);
            return { name, debts, id };
          };

        groups = await pipe(
          debts,
          A.map(formatDebt),
          groupBy(getGroupKey),
          toArray,
          A.traverse(T.ApplicativePar)(createGroupUsing(getGroupDetails)),
        )();
      } else {
        groups = [{ debts }];
      }

      return { options, groups };
    },
  });

  bus.provideNamed(reportTypeIface, 'debt-status-report', {
    async getDetails() {
      return {
        template: 'debt-status-report',
        scale: 0.7,
      };
    },

    async generate(args, { pg }, bus) {
      const result = debtStatusReportOptions.decode(args.options);

      if (E.isLeft(result)) {
        throw new Error('Invalid options!');
      }

      const options = result.right;

      let statusFilter = sql``;

      if (options.includeOnly === 'paid') {
        statusFilter = sql` HAVING bool_or(ps.status = 'paid') `;
      } else if (options.includeOnly === 'credited') {
        statusFilter = sql` HAVING debt.credited `;
      } else if (options.includeOnly === 'open') {
        statusFilter = sql` HAVING NOT (bool_or(ps.status = 'paid') OR debt.credited) `;
      }

      const dbResults = await pg.many<
        DbDebt &
          (
            | { status: 'paid'; paid_at: Date }
            | { status: 'open'; paid_at: null }
          ) & { payment_id: string }
      >(
        sql`
          WITH payment_agg AS (
            SELECT
              payment_id,
              SUM(amount) AS balance,
              (COUNT(*) FILTER (WHERE type = 'payment'::text)) > 0 AS has_payment_event,
              (COUNT(*) FILTER (WHERE type = 'canceled'::text)) > 0 AS has_cancel_event,
              MAX(time) AS updated_at
            FROM payment_events e
            WHERE time < ${options.date} OR type = 'created'
            GROUP BY payment_id
          ),
          payment_statuses AS (
            SELECT
              p.id AS payment_id,
              (
                SELECT time
                FROM payment_events e2
                WHERE e2.payment_id = p.id AND e2.type = 'payment' AND e2.time < ${options.date}
                ORDER BY e2.time DESC
                LIMIT 1
              ) AS paid_at, 
              CASE
                  WHEN s.has_cancel_event THEN 'canceled'::payment_status
                  WHEN (NOT s.has_payment_event) THEN 'unpaid'::payment_status
                  WHEN (s.balance <> 0) THEN 'mispaid'::payment_status
                  ELSE 'paid'::payment_status
              END AS status
            FROM payment_agg s
            LEFT JOIN payments p ON p.id = s.payment_id
            LEFT JOIN payment_debt_mappings pdm ON pdm.payment_id = p.id
            INNER JOIN debt d ON d.id = pdm.debt_id AND d.published_at IS NOT NULL AND d.date < ${options.date} 
            LEFT JOIN payer_profiles pp ON pp.id = d.payer_id
          )
          SELECT
            debt.*,
            TO_JSON(payer_profiles.*) AS payer,
            TO_JSON(debt_center.*) AS debt_center,
            ARRAY_AGG(TO_JSON(debt_component.*)) AS debt_components,
            (
              SELECT SUM(dc.amount) AS total
              FROM debt_component_mapping dcm
              JOIN debt_component dc ON dc.id = dcm.debt_component_id
              WHERE dcm.debt_id = debt.id
            ) AS total,
            (SELECT ARRAY_AGG(TO_JSONB(debt_tags.*)) FROM debt_tags WHERE debt_tags.debt_id = debt.id) AS tags,
            (CASE
              WHEN debt.credited THEN 'credited'
              WHEN bool_or(ps.status = 'paid') THEN 'paid'
              ELSE 'open'
            END) status,
            MIN(ps.paid_at) paid_at,
            (CASE
              WHEN bool_or(ps.status = 'paid') THEN (ARRAY_AGG(ps.payment_id ORDER BY ps.paid_at) FILTER (WHERE ps.status = 'paid'))[1]
            END) payment_id
          FROM debt
          LEFT JOIN payment_debt_mappings pdm ON pdm.debt_id = debt.id
          LEFT JOIN payment_statuses ps ON ps.payment_id = pdm.payment_id
          LEFT JOIN payer_profiles ON payer_profiles.id = debt.payer_id
          LEFT JOIN debt_center ON debt_center.id = debt.debt_center_id
          LEFT JOIN debt_component_mapping ON debt_component_mapping.debt_id = debt.id
          LEFT JOIN debt_component ON debt_component_mapping.debt_component_id = debt_component.id
          WHERE debt.published_at IS NOT NULL
        `
          .append(
            options.centers
              ? sql` AND debt_center.id = ANY (${options.centers})`
              : sql``,
          )
          .append(sql` GROUP BY debt.id, payer_profiles.*, debt_center.*`)
          .append(statusFilter)
          .append(sql` ORDER BY MIN(ps.paid_at)`),
      );

      const results = await Promise.all(
        dbResults.map(
          async row =>
            [
              formatDebt(row),
              row.status,
              row.paid_at,
              row.payment_id
                ? await bus.exec(paymentService.getPayment, row.payment_id)
                : null,
            ] as [Debt, 'open' | 'paid', Date, Payment | null],
        ),
      );

      let groups;

      if (options.groupBy) {
        let getGroupKey: (debt: Debt) => string;
        let getGroupDetails;

        if (options.groupBy === 'center') {
          getGroupKey = (debt: Debt) => debt.debtCenterId;
          getGroupDetails = async (id: string) => {
            const center = await bus.exec(debtCentersService.getDebtCenter, id);
            const name = center?.name ?? 'Unknown debt center';
            const displayId = center?.humanId ?? '???';
            return { name, id: displayId };
          };
        } else {
          getGroupKey = (debt: Debt) => debt.payerId.value;
          getGroupDetails = async (id: string) => {
            const payer = await bus.exec(
              payerService.getPayerProfileByInternalIdentity,
              internalIdentity(id),
            );
            const name = payer?.name ?? 'Unknown payer';
            const displayId = payer?.id?.value ?? '???';
            return { name, id: displayId };
          };
        }

        const createGroupUsing =
          (
            nameResolver: (id: string) => Promise<{ name: string; id: string }>,
          ) =>
          ([key, debts]: [
            string,
            [Debt, 'open' | 'paid', Date | null, Payment | null][],
          ]) =>
          async () => {
            const { name, id } = await nameResolver(key);
            return { name, debts, id };
          };

        groups = await pipe(
          results,
          groupBy(([debt]) => getGroupKey(debt)),
          toArray,
          A.traverse(T.ApplicativePar)(createGroupUsing(getGroupDetails)),
        )();
      } else {
        groups = [{ debts: results }];
      }

      return { options, groups };
    },
  });
};
