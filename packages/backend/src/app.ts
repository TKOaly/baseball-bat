import 'reflect-metadata';
import { Config } from './config';
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
import { Session } from './middleware/session';
import { setupMinio } from './minio';

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
  pg: Connection;
  session: Session | null;
};



const setupDeps = async () => {
  const minio = await setupMinio(config);
  const bus = await LocalBus.create<BusContext>(config);
  const jobs = new JobService(config, bus, pool);

  return {
    pool,
    config,
    bus,
    redis: redisClient,
    jobs,
    emailTransport,
    minio,
  };
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
  const deps = await setupDeps();
  const app = await server(deps);
  app.listen(PORT, () => console.log(`backend listening on port ${PORT} 🚀`));
}

start();
