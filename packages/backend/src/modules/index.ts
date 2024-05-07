import { ModuleDeps } from '@/module';
import express from 'express';
import debts from './debts';
import accounting from './accounting';
import banking from './banking';
import jobs from './jobs';
import debtCenters from './debt-centers';
import email from './email';
import events from './events';
import payments from './payments';
import payers from './payers';
import users from './users';
import invoices from './invoices';
import stripe from './stripe';
import reports from './reports';
import { ModuleDefinition, createBaseRoute } from '@/module';
import { Middleware } from 'typera-express';
import search from './search';
import session from './session';
import audit from './audit';

export default async (app: express.Express | null, deps: ModuleDeps) => {
  const route = createBaseRoute(deps);

  const initModule = async <T>(module: ModuleDefinition<T>) => {
    const data = await module.setup(deps);

    if (app && module.routes) {
      const router = module.routes(
        route.use(() => Middleware.next({ module: data })),
        { config: deps.config },
      );
      app.use(`/api/${module.name}`, router.handler());
    }
  };

  const registerModules = async <M extends Array<ModuleDefinition<any>>>(
    modules: M,
  ) => {
    await Promise.all(modules.map(initModule));
  };

  await registerModules([
    accounting,
    banking,
    debtCenters,
    debts,
    email,
    payers,
    payments,
    reports,
    search,
    events,
    invoices,
    users,
    stripe,
    jobs,
    session,
    audit,
  ]);
};
