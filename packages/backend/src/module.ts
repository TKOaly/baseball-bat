import { Middleware, Router, route } from 'typera-express';
import { Connection, Pool } from '@/db/connection';
import { LocalBus } from '@/bus';
import dbMiddleware from '@/db/middleware';
import { BusContext } from './app';
import * as redis from 'redis';
import { JobService } from './modules/jobs';
import { Config } from './config';
import { IEmailTransport } from './modules/email';
import { Session, sessionMiddleware } from './middleware/session';
import { Client as MinioClient } from 'minio';

export type ModuleDeps = {
  bus: LocalBus<BusContext>;
  pool: Pool;
  redis: ReturnType<typeof redis.createClient>;
  jobs: JobService;
  minio: MinioClient;
  config: Config;
  emailTransport: IEmailTransport;
};

const createBusContext = (req: {
  pg: Connection;
  session: Session | null;
}) => ({ pg: req.pg, session: req.session });

export const createBaseRoute = ({
  bus,
  pool,
  redis,
  minio,
  jobs,
}: ModuleDeps) =>
  route
    .use(dbMiddleware(pool))
    .use(() => Middleware.next({ redis, jobs, minio }))
    .use(sessionMiddleware)
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
