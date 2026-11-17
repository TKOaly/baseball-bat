import './instrumentation';
import 'reflect-metadata';

import { Config } from './config';
import { Span } from '@opentelemetry/api';
import { Pool, Connection } from './db/connection';
import * as redis from 'redis';
import {
  createEmailDispatcherTransport,
  createSMTPTransport,
  IEmailTransport,
} from './modules/email';
import { LocalBus } from './bus';
import server from './server';
import { Session } from './middleware/session';
import { setupMinio } from './minio';
import { setupNats } from './nats';
import { NatsConnection } from 'nats';
import logger, { Logger } from './logger';

// Without these, a crash is only visible as a plain text stack trace on
// stderr. Registered before any setup code runs, so that configuration errors
// at startup are logged as JSON too. pino flushes its output synchronously on
// exit, so the line is written before the process exits.
process.on('uncaughtException', err => {
  logger.fatal({ err }, 'Uncaught exception');
  process.exit(1);
});

process.on('unhandledRejection', reason => {
  logger.fatal({ err: reason }, 'Unhandled promise rejection');
  process.exit(1);
});

const PORT = process.env.PORT ?? '5000';
const config = Config.get();

const pool = new Pool(config.dbUrl);

const redisClient = redis.createClient({
  url: config.redisUrl,
});

redisClient.on('error', err => {
  logger.error({ err, component: 'redis' }, 'Redis client error');
});

redisClient.connect();

let emailTransport: IEmailTransport;

if (config.emailDispatcher) {
  emailTransport = createEmailDispatcherTransport(config.emailDispatcher);
} else {
  emailTransport = createSMTPTransport(config.smtp);
}

export type BusContext = {
  nats: NatsConnection;
  pg: Connection;
  session: Session | null;
  logger: Logger;
  span: Span;
};

const setupDeps = async () => {
  const nats = await setupNats(config);
  const bus = new LocalBus<BusContext>();
  const minio = await setupMinio(config, logger);

  return {
    pool,
    config,
    bus,
    redis: redisClient,
    emailTransport,
    minio,
    nats,
    logger,
  };
};

declare global {
  // eslint-disable-next-line
  namespace Express {
    export interface Request {
      rawBody?: Buffer;
      span?: Span;
    }
  }
}

async function start() {
  const deps = await setupDeps();
  const app = await server(deps);

  app.listen(PORT, () =>
    logger.info(
      { port: parseInt(PORT, 10) },
      `Backend listening on port ${PORT}`,
    ),
  );
}

start().catch(err => {
  logger.fatal({ err }, 'Failed to start the backend');
  process.exit(1);
});
