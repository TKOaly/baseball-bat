import { NewDebtCenter, DbDebtCenter, DebtCenter } from '../../common/types'
import { PgClient } from '../db'
import { Service, Inject } from 'typedi'
import sql from 'sql-template-strings'

export const formatDebtCenter = (debtCenter: DbDebtCenter): DebtCenter => ({
  id: debtCenter.id,
  name: debtCenter.name,
  description: debtCenter.description,
  createdAt: debtCenter.created_at,
  updatedAt: debtCenter.updated_at,
  debtCount: debtCenter.debt_count,
  paidCount: debtCenter.paid_count,
  unpaidCount: debtCenter.unpaid_count,
  url: debtCenter.url,
})

@Service()
export class DebtCentersService {
  @Inject(() => PgClient)
  pg: PgClient

  getDebtCenters() {
    return this.pg
      .any<DbDebtCenter>(sql`
        SELECT
          dc.*,
          COUNT(d.id) as debt_count,
          COUNT(d.id) FILTER (WHERE ds.is_paid) AS paid_count,
          COUNT(d.id) FILTER (WHERE NOT ds.is_paid) AS unpaid_count
        FROM debt_center dc
        LEFT JOIN debt d ON d.debt_center_id = dc.id
        LEFT JOIN debt_statuses ds ON ds.id = d.id
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
}
