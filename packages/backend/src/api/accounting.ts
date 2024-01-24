import { route, router } from 'typera-express';
import { ok } from 'typera-express/response';
import * as accountingService from '@/services/accounting/definitions';
import type { ApiDeps } from '.';

export default ({ auth, bus }: ApiDeps) => {
  const getAccountingPeriods = route
    .get('/periods')
    .use(auth.createAuthMiddleware())
    .handler(async _ctx => {
      const periods = await bus.exec(accountingService.getAccountingPeriods);
      return ok(periods);
    });

  return router(getAccountingPeriods);
}
