import { Middleware, route, Router } from 'typera-express';
import auth from './auth';
import express from 'express';
import accounting from './accounting';
import banking from './banking';
import centers from './centers';
import debt from './debt';
import email from './email';
import events from './events';
import payers from './payers';
import session from './session';
import payments from './payments';
import reports from './report';
import jobs from './jobs';
import { ApplicationBus, ExecutionContext, LocalBus } from '@/bus';
import { Config } from '@/config';
import { AuthService } from '@/auth-middleware';
import { JobService } from '@/services/jobs';
import Stripe from 'stripe';
import { PgClient, PoolConnection } from '@/db';
import { RedisClientType } from 'redis';
import { BusContext } from '@/app';

export type BusMiddleware = Middleware.ChainedMiddleware<
  { pg: PoolConnection },
  { bus: ExecutionContext<BusContext> },
  never
>;

export const busMiddleware =
  (bus: ApplicationBus<BusContext>): BusMiddleware =>
  async ({ pg }) => {
    return Middleware.next({ bus: bus.createContext({ pg }) });
  };

export const createBaseRoute = ({ bus, pg }: ApiDeps) =>
  route.use(pg.middleware()).use(busMiddleware(bus));

type BaseRoute = ReturnType<typeof createBaseRoute>;

export type ApiDeps = {
  bus: LocalBus<BusContext>;
  config: Config;
  redis: RedisClientType;
  auth: AuthService;
  pg: PgClient;
  jobs: JobService;
  stripe: Stripe;
};

export type ApiFactory = (deps: ApiDeps, route: BaseRoute) => Router;

export default (deps: ApiDeps, app: express.Express) => {
  const routes: Record<string, ApiFactory> = {
    session,
    accounting,
    banking,
    debt,
    events,
    jobs,
    email,
    debtCenters: centers,
    payers,
    payments,
    reports,
  };

  const route = createBaseRoute(deps);

  Object.entries(routes).forEach(([path, init]) =>
    app.use(`/api/${path}`, init(deps, route).handler()),
  );

  app.use('/api', auth(deps, route).handler());
};
