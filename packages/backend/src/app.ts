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
import logger from './logger';
import { Logger } from 'winston';

const PORT = process.env.PORT ?? '5000';
const config = Config.get();

const pool = new Pool(config.dbUrl);

const redisClient = redis.createClient({
  url: config.redisUrl,
});

redisClient.on('error', error => {
  console.error('Redis client error:', error);
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
    logger.info(`Backend listening on port ${PORT} 🚀`, {
      port: parseInt(PORT),
    }),
  );
}

start();
