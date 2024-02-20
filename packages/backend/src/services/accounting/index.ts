import sql from 'sql-template-strings';
import {
  AccountingPeriod,
  DbAccountingPeriod,
} from '@bbat/common/build/src/types';
import { ModuleDeps } from '@/app';
import iface from './definitions';

const formatAccountingPeriod = (db: DbAccountingPeriod): AccountingPeriod => ({
  year: db.year,
  closed: db.closed,
});

export default ({ pg, bus }: ModuleDeps) => {
  bus.provide(iface, {
    async getAccountingPeriods() {
      const periods = await pg.any<DbAccountingPeriod>(
        sql`SELECT * FROM accounting_periods`,
      );

      return periods.map(formatAccountingPeriod);
    },

    async isAccountingPeriodOpen(year) {
      const result = await pg.one<{ exists: boolean }>(sql`
        SELECT EXISTS(SELECT 1 FROM accounting_periods WHERE year = ${year} AND NOT closed) AS exists
      `);

      return !!result?.exists;
    },
  });
};
