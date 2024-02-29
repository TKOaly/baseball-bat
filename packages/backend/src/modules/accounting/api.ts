import { router } from 'typera-express';
import { ok } from 'typera-express/response';
import * as accountingService from '@/modules/accounting/definitions';
import { RouterFactory } from '@/module';
import auth from '@/auth-middleware';

const factory: RouterFactory = route => {
  const getAccountingPeriods = route
    .get('/periods')
    .use(auth())
    .handler(async ({ bus }) => {
      const periods = await bus.exec(accountingService.getAccountingPeriods);
      return ok(periods);
    });

  return router(getAccountingPeriods);
};

export default factory;
