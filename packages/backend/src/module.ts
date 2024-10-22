import { Middleware, Router, route } from 'typera-express';
import { Connection, Pool } from '@/db/connection';
import { Bus, busMiddleware } from '@/bus';
import dbMiddleware from '@/db/middleware';
import { Logger } from 'winston';
import { BusContext } from './app';
import * as redis from 'redis';
import { JobService } from './modules/jobs';
import { Config } from './config';
import { IEmailTransport } from './modules/email';
import { Session, sessionMiddleware } from './middleware/session';
import { Client as MinioClient } from 'minio';
import { NatsConnection } from 'nats';

export type ModuleDeps = {
  bus: Bus<BusContext>;
  pool: Pool;
  redis: ReturnType<typeof redis.createClient>;
  jobs: JobService;
  nats: NatsConnection;
  minio: MinioClient;
  config: Config;
  logger: Logger;
  emailTransport: IEmailTransport;
};

const createBusContext = (req: {
  pg: Connection;
  nats: NatsConnection;
  session: Session | null;
  logger: Logger;
}) => ({
  pg: req.pg,
  session: req.session,
  nats: req.nats,
  logger: req.logger,
});

export const createBaseRoute = ({
  bus,
  pool,
  redis,
  minio,
  jobs,
  nats,
  config,
  logger,
}: ModuleDeps) =>
  route
    .use(dbMiddleware(pool))
    .use(() => Middleware.next({ redis, jobs, minio, nats, logger }))
    .use(sessionMiddleware(config))
    .use(busMiddleware(bus, createBusContext));

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
