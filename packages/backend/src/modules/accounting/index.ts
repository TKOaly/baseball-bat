import sql from 'sql-template-strings';
import {
  AccountingPeriod,
  DbAccountingPeriod,
} from '@bbat/common/build/src/types';
import iface from './definitions';
import routes from './api';
import { createModule } from '@/module';

const formatAccountingPeriod = (db: DbAccountingPeriod): AccountingPeriod => ({
  year: db.year,
  closed: db.closed,
});

export default createModule({
  name: 'accounting',

  routes,

  async setup({ bus }) {
    bus.provide(iface, {
      async getAccountingPeriods(_, { pg }) {
        const periods = await pg.many<DbAccountingPeriod>(
          sql`SELECT * FROM accounting_periods`,
        );

        return periods.map(formatAccountingPeriod);
      },

      async isAccountingPeriodOpen(year, { pg }) {
        const result = await pg.one<{ exists: boolean }>(sql`
          SELECT EXISTS(SELECT 1 FROM accounting_periods WHERE year = ${year} AND NOT closed) AS exists
        `);

        return !!result?.exists;
      },
    });
  },
});
