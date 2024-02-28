import { Middleware, Router } from 'typera-express';
import auth from './auth';
import express from 'express';
import session from './session';
import { LocalBus } from '@/bus';
import { Config } from '@/config';
import { JobService } from '@/services/jobs';
import redis from 'redis';
import { BusContext } from '@/app';
import { Pool } from '@/db/connection';
import { BaseRoute, createBaseRoute, ModuleDeps } from '@/module';

export type ApiDeps = {
  bus: LocalBus<BusContext>;
  config: Config;
  redis: ReturnType<typeof redis.createClient>;
  pool: Pool;
  jobs: JobService;
};

export type ApiFactory = (deps: ApiDeps, route: BaseRoute<void>) => Router;

export default (
  moduleDeps: ModuleDeps,
  deps: ApiDeps,
  app: express.Express,
) => {
  const routes: Record<string, ApiFactory> = {
    session,
  };

  const route = createBaseRoute(moduleDeps).use(() =>
    Middleware.next({ module: undefined as void }),
  );

  Object.entries(routes).forEach(([path, init]) =>
    app.use(`/api/${path}`, init(deps, route).handler()),
  );

  app.use('/api', auth(deps, route).handler());
};
