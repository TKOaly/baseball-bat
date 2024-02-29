import 'reflect-metadata';
import { Config } from './config';
import Stripe from 'stripe';
import { Pool, Connection } from './db/connection';
import * as redis from 'redis';
import {
  createEmailDispatcherTransport,
  createSMTPTransport,
  IEmailTransport,
} from './modules/email';
import { JobService } from './modules/jobs';
import { LocalBus } from './bus';
import server from './server';

const PORT = process.env.PORT ?? '5000';
const config = Config.get();

const stripeClient = new Stripe(config.stripeSecretKey, {
  apiVersion: '2020-08-27',
});

const pool = new Pool(config.dbUrl);

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
  pg: Connection;
};

const bus = new LocalBus<BusContext>();

const jobs = new JobService(config, bus, pool);

const moduleDeps = {
  pool,
  config,
  bus,
  redis: redisClient,
  stripe: stripeClient,
  jobs,
  emailTransport,
};

declare global {
  // eslint-disable-next-line
  namespace Express {
    export interface Request {
      rawBody?: Buffer;
    }
  }
}

async function start() {
  const app = await server(moduleDeps);
  app.listen(PORT, () => console.log(`backend listening on port ${PORT} 🚀`));
}

start();
