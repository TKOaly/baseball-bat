import { router } from 'typera-express';
import { ok } from 'typera-express/response';
import * as accountingService from '@/services/accounting/definitions';
import type { ApiFactory } from '.';

const factory: ApiFactory = ({ auth }, route) => {
  const getAccountingPeriods = route
    .get('/periods')
    .use(auth.createAuthMiddleware())
    .handler(async ({ bus }) => {
      const periods = await bus.exec(accountingService.getAccountingPeriods);
      return ok(periods);
    });

  return router(getAccountingPeriods);
};

export default factory;
