import express from 'express';
import { router } from 'typera-express';
import healthCheck from './api/health-check';
import 'reflect-metadata';
import { RedisClientType } from 'redis';
import { Config } from './config';
import apiRoutes, { ApiDeps } from './api';
import cookieParser from 'cookie-parser';
import Stripe from 'stripe';
import { PgClient, PoolConnection } from './db';
import cors from 'cors';
import helmet, { HelmetOptions } from 'helmet';
import * as redis from 'redis';
import {
  createEmailDispatcherTransport,
  createSMTPTransport,
  IEmailTransport,
} from './services/email';
import { JobService } from './services/jobs';
import { LocalBus } from './bus';
import initServices from './services';
import { authServiceFactory } from './auth-middleware';

const PORT = process.env.PORT ?? '5000';
const config = Config.get();

const helmetConfig: HelmetOptions = {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'", '*.stripe.com'],
      scriptSrc:
        process.env.NODE_ENV !== 'production'
          ? [
              "'self'",
              '*.stripe.com',
              "'unsafe-eval'",
              'ws://bbat.tko-aly.localhost:1234',
              'ws://localhost:1234',
            ]
          : ["'self'", '*.stripe.com'],
      connectSrc:
        process.env.NODE_ENV !== 'production'
          ? [
              "'self'",
              'ws://bbat.tko-aly.localhost:1234',
              'ws://localhost:1234',
            ]
          : ["'self'"],
      frameAncestors: ['*.stripe.com'],
    },
  },
  crossOriginEmbedderPolicy: false,
};

const stripeClient = new Stripe(config.stripeSecretKey, {
  apiVersion: '2020-08-27',
});

const pg = PgClient.create(config.dbUrl);

const redisClient = redis.createClient({
  url: config.redisUrl,
});

redisClient.connect();

let emailTransport: IEmailTransport;

if (config.emailDispatcher) {
  emailTransport = createEmailDispatcherTransport(config.emailDispatcher);
} else {
  emailTransport = createSMTPTransport(config.smtp);
}

export type BusContext = {
  pg: PoolConnection;
};

const bus = new LocalBus<BusContext>();

// bus.on(shutdown, () => redisClient.shutdown());

const jobs = new JobService(
  config,
  redisClient as RedisClientType,
  bus,
  pg.conn,
);

const moduleDeps = {
  pg,
  config,
  bus,
  redis: redisClient,
  stripe: stripeClient,
  jobs,
  emailTransport,
};

const auth = authServiceFactory(moduleDeps);

export type ModuleDeps = typeof moduleDeps;

const apiDeps: ApiDeps = {
  pg,
  bus,
  jobs,
  redis: redisClient as RedisClientType,
  config,
  auth,
  stripe: stripeClient,
};

declare global {
  // eslint-disable-next-line
  namespace Express {
    export interface Request {
      rawBody?: Buffer;
    }
  }
}

const app = express()
  .use((req, _res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
  })
  .use(helmet(helmetConfig))
  .use(
    cors({
      methods: ['GET', 'POST', 'OPTIONS'],
      origin: [config.appUrl],
    }),
  )
  .use(
    express.json({
      verify: (req, _res, buf) => {
        (req as Express.Request).rawBody = buf;
      },
    }),
  )
  .use(cookieParser())
  .use(router(healthCheck).handler());

apiRoutes(apiDeps, app);

if (process.env.NODE_ENV !== 'production') {
  app.use('/static', express.static('/usr/src/app/packages/frontend/dist'));
  app.use('/', (_req, res) =>
    res.sendFile('/usr/src/app/packages/frontend/dist/index.html'),
  );
}

async function start() {
  await initServices(moduleDeps);

  app.listen(PORT, () => console.log(`backend listening on port ${PORT} 🚀`));
}

start();
