import { Middleware } from 'typera-express';
import { ModuleDefinition, createBaseRoute } from '@/module';
import { ModuleDeps } from '@/module';

import accounting from './accounting';
import audit from './audit';
import banking from './banking';
import debtCenters from './debt-centers';
import debts from './debts';
import email from './email';
import events from './events';
import express from 'express';
import integration from './integration';
import invoices from './invoices';
import jobs from './jobs';
import payers from './payers';
import payments from './payments';
import reports from './reports';
import search from './search';
import session from './session';
import stripe from './stripe';
import users from './users';

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
    integration,
  ]);
};
