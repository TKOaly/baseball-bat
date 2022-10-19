import { NewDebtCenter, DbDebtCenter, DebtCenter, DebtCenterPatch } from '../../common/types'
import { PgClient } from '../db'
import { Service, Inject } from 'typedi'
import sql from 'sql-template-strings'
import { cents } from '../../common/currency'
import { DebtService } from './debt'
import * as E from 'fp-ts/lib/Either'

export const formatDebtCenter = (debtCenter: DbDebtCenter): DebtCenter => ({
  id: debtCenter.id,
  name: debtCenter.name,
  description: debtCenter.description,
  createdAt: debtCenter.created_at,
  updatedAt: debtCenter.updated_at,
  debtCount: debtCenter.debt_count,
  paidCount: debtCenter.paid_count,
  unpaidCount: debtCenter.unpaid_count,
  total: debtCenter.total === undefined ? undefined : cents(parseInt('' + debtCenter.total)),
  url: debtCenter.url,
})

@Service()
export class DebtCentersService {
  @Inject(() => PgClient)
  pg: PgClient

  @Inject(() => DebtService)
  debtService: DebtService

  getDebtCenters() {
    return this.pg
      .any<DbDebtCenter>(sql`
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
        GROUP BY dc.id
      `)
      .then(dbDebtCenters => dbDebtCenters.map(formatDebtCenter))
  }

  getDebtCenterByName(name: string) {
    return this.pg
      .one<DbDebtCenter>(sql`SELECT * FROM debt_center WHERE name = ${name}`)
      .then(dbDebtCenters => dbDebtCenters && formatDebtCenter(dbDebtCenters))
  }

  getDebtCenter(id: string) {
    return this.pg
      .one<DbDebtCenter>(sql`SELECT * FROM debt_center WHERE id = ${id}`)
      .then(dbDebtCenters => dbDebtCenters && formatDebtCenter(dbDebtCenters))
  }

  createDebtCenter(center: NewDebtCenter) {
    return this.pg
      .one<DbDebtCenter>(sql`
        INSERT INTO debt_center (name, url, description)
        VALUES (
          ${center.name},
          ${center.url},
          ${center.description}
        )
        RETURNING *
      `)
      .then((dbDebtCenter) => dbDebtCenter && formatDebtCenter(dbDebtCenter))
  }

  async updateDebtCenter(center: DebtCenterPatch) {
    const existing = await this.getDebtCenter(center.id)

    if (!existing) {
      return E.left(new Error('No such debt center'))
    }

    const query = sql`
      UPDATE debt_center
      SET
        name = ${center.name},
        description = ${center.description},
        url = ${center.url}
      WHERE
        id = ${center.id}
    `

    await this.pg.one(query)

    return E.right(null)
  }
}
