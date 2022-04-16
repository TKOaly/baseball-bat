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
  url: debtCenter.url,
})

@Service()
export class DebtCentersService {
  @Inject(() => PgClient)
  pg: PgClient

  getDebtCenters() {
    return this.pg
      .any<DbDebtCenter>(sql`SELECT * FROM debt_center`)
      .then(dbDebtCenters => dbDebtCenters.map(formatDebtCenter))
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
