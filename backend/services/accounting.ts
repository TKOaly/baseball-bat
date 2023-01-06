import { Inject, Service } from "typedi";
import { PgClient } from "../db";
import sql from "sql-template-strings";
import { AccountingPeriod, DbAccountingPeriod } from "../../common/types";

const formatAccountingPeriod = (db: DbAccountingPeriod): AccountingPeriod => ({
  year: db.year,
  closed: db.closed,
});

@Service()
export class AccountingService {
  @Inject(() => PgClient)
  pg: PgClient;

  async getAccountingPeriods() {
    const periods = await this.pg.any<DbAccountingPeriod>(sql`SELECT * FROM accounting_periods`);
    return periods.map(formatAccountingPeriod);
  }
}
