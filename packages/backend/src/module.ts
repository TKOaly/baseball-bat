import { Middleware, Router, route } from 'typera-express';
import { Middleware as CommonMiddleware } from 'typera-common/middleware';
import opentelemetry from '@opentelemetry/api';
import { Span } from '@opentelemetry/api';
import {
  ATTR_HTTP_ROUTE,
  ATTR_HTTP_REQUEST_METHOD,
  ATTR_HTTP_RESPONSE_STATUS_CODE,
} from '@opentelemetry/semantic-conventions';
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

type MiddlewareRequest<M extends Middleware.Generic> =
  M extends Middleware.ChainedMiddleware<infer R, any, any>
    ? R
    : Record<string, never>;
type MiddlewareResponse<M extends Middleware.Generic> =
  M extends Middleware.ChainedMiddleware<any, any, infer R>
    ? R
    : M extends Middleware.Middleware<any, infer R>
      ? R
      : never;
type MiddlewareResult<M extends Middleware.Generic> =
  M extends Middleware.ChainedMiddleware<any, infer R, any>
    ? R
    : M extends Middleware.Middleware<infer R, any>
      ? R
      : never;

const createBusContext = (req: {
  pg: Connection;
  nats: NatsConnection;
  session: Session | null;
  logger: Logger;
  span: Span;
}) => ({
  pg: req.pg,
  session: req.session,
  nats: req.nats,
  logger: req.logger,
  span: req.span,
});

const traceMiddleware =
  <M extends CommonMiddleware<any, any, any>>(
    name: string,
    middleware: M,
  ): Middleware.ChainedMiddleware<
    { span: Span } & MiddlewareRequest<M>,
    MiddlewareResult<M>,
    MiddlewareResponse<M>
  > =>
  async context => {
    const { span } = context;
    const tracer = opentelemetry.trace.getTracer('baseball-bat');
    const spanContext = opentelemetry.trace.setSpan(
      opentelemetry.context.active(),
      span,
    );

    return tracer.startActiveSpan(
      `middleware: ${name}`,
      {},
      spanContext,
      async span => {
        const result = await Promise.resolve(middleware(context) as any);
        span.end();
        return result;
      },
    );
  };

const traceRequest: Middleware.Middleware<{ span: Span }, never> = ({
  req,
  res,
}) => {
  if (req.span) {
    return Middleware.next({ span: req.span });
  }

  const { trace: tracing } = opentelemetry;

  const tracer = tracing.getTracer('baseball-bat');
  const name = `[${req.method}] ${req.originalUrl}`;
  const span = tracer.startSpan(name, {
    root: true,
    attributes: {
      [ATTR_HTTP_ROUTE]: req.originalUrl,
      [ATTR_HTTP_REQUEST_METHOD]: req.method,
    },
  });

  return Middleware.next({ span }, () => {
    span.setAttribute(ATTR_HTTP_RESPONSE_STATUS_CODE, res.statusCode);
    span.end();
  });
};

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
    .use(() => Middleware.next({ redis, jobs, minio, nats, logger }))
    .use(traceRequest)
    .use(traceMiddleware('db', dbMiddleware(pool)))
    .use(traceMiddleware('session', sessionMiddleware(config)))
    .use(traceMiddleware('bus', busMiddleware(bus, createBusContext)));

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
