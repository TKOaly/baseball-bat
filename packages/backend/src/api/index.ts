import { Middleware, Router } from 'typera-express';
import express from 'express';
import { LocalBus } from '@/bus';
import { Config } from '@/config';
import redis from 'redis';
import { BusContext } from '@/app';
import { Pool } from '@/db/connection';
import { BaseRoute, createBaseRoute, ModuleDeps } from '@/module';
import testing from './testing';
import health from './health-check';

export type ApiDeps = {
  bus: LocalBus<BusContext>;
  config: Config;
  redis: ReturnType<typeof redis.createClient>;
  pool: Pool;
};

export type ApiFactory = (deps: ApiDeps, route: BaseRoute<void>) => Router;

export default (
  moduleDeps: ModuleDeps,
  deps: ApiDeps,
  app: express.Express,
) => {
  const routes: Record<string, ApiFactory> = {
    testing,
    health,
  };

  const route = createBaseRoute(moduleDeps).use(() =>
    Middleware.next({ module: undefined as void }),
  );

  Object.entries(routes).forEach(([path, init]) =>
    app.use(`/api/${path}`, init(deps, route).handler()),
  );
};
