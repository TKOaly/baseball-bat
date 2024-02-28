import { Middleware, Router, route } from 'typera-express';
import { Connection, Pool } from '@/db/connection';
import { LocalBus } from '@/bus';
import dbMiddleware from '@/db/middleware';
import { BusContext } from './app';
import * as redis from 'redis';
import { JobService } from './services/jobs';
import { Config } from './config';
import { IEmailTransport } from './services/email';

export type ModuleDeps = {
  bus: LocalBus<BusContext>;
  pool: Pool;
  redis: ReturnType<typeof redis.createClient>;
  jobs: JobService;
  config: Config;
  emailTransport: IEmailTransport;
};

const createBusContext = (req: { pg: Connection }) => ({ pg: req.pg });

export const createBaseRoute = ({ bus, pool, redis, jobs }: ModuleDeps) =>
  route
    .use(dbMiddleware(pool))
    .use(() => Middleware.next({ redis, jobs }))
    .use(bus.middleware(createBusContext));

const _extendBaseRoute = <T>(deps: ModuleDeps, module: T) =>
  createBaseRoute(deps).use(() => Middleware.next({ module }));

export type BaseRoute<T> = ReturnType<typeof _extendBaseRoute<T>>;

export type RouterFactoryContext = {
  config: Config;
};

export type RouterFactory<T = void> = (
  route: BaseRoute<T>,
  context: RouterFactoryContext,
) => Router;

export type ModuleDefinition<T> = {
  name: string;

  setup: (deps: ModuleDeps) => Promise<T>;

  routes?: RouterFactory<T>;
};

export const createModule = <T>(
  def: ModuleDefinition<T>,
): ModuleDefinition<T> => def;
