import { ApiDeps } from '@/api';
import opentelemetry from '@opentelemetry/api';
import { BusContext } from '@/app';
import winston from 'winston';
import * as redis from 'redis';
import { Config } from '@/config';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { setupMinio as setupMinioClient } from '@/minio';
import fs from 'fs/promises';
import os from 'os';
import migrate from 'node-pg-migrate';
import path from 'path';
import { setupNats as connectNats } from '@/nats';
import { GenericContainer, Wait } from 'testcontainers';
import {
  EventHandler,
  EventType,
  ExecutionContext,
  LocalBus,
  ProcedureHandler,
  ProcedureType,
} from '@/bus';
import { Pool } from '@/db/connection';
import { IEmailTransport } from '@/modules/email';
import server from '@/server';
import { shutdown } from '@/orchestrator';
import { mock } from 'node:test';
import { ModuleDeps } from '@/module';
import { internalIdentity } from '@bbat/common/types';
import { randomString } from 'remeda';

export const setupPostgres = async () => {
  const container = await new PostgreSqlContainer().start();

  await migrate({
    databaseUrl: container.getConnectionUri(),
    migrationsTable: '__migrations',
    direction: 'up',
    dir: path.resolve(__dirname, '../migrations'),
    log: () => {
      return;
    },
  });

  return {
    container,
    uri: container.getConnectionUri(),
  };
};

const setupRedis = async () => {
  const container = await new GenericContainer('redis')
    .withExposedPorts(6379)
    .withWaitStrategy(Wait.forLogMessage(/Ready to accept connections/, 1))
    .start();

  const uri = `redis://${container.getHost()}:${container.getMappedPort(6379)}`;

  return { container, uri };
};

const setupNats = async () => {
  const container = await new GenericContainer('nats')
    .withCommand(['-js'])
    .withExposedPorts(4222)
    .withWaitStrategy(Wait.forLogMessage(/Server is ready/, 1))
    .start();

  const config = {
    host: container.getHost(),
    port: container.getMappedPort(4222),
  };

  return { container, config };
};

const setupMinio = async () => {
  const secretKey = randomString(16);
  const accessKey = randomString(16);

  const container = await new GenericContainer('bitnami/minio')
    .withExposedPorts(9000)
    .withEnvironment({
      MINIO_ROOT_USER: accessKey,
      MINIO_ROOT_PASSWORD: secretKey,
    })
    .withWaitStrategy(Wait.forHttp('/minio/health/live', 9000))
    .start();

  const uri = `http://${container.getHost()}:${container.getMappedPort(9000)}`;

  return {
    container,
    secretKey,
    accessKey,
    uri,
  };
};

type TeardownHook = () => Promise<void>;

type Deps = ApiDeps & ModuleDeps;

export class Environment {
  private teardownHooks: Array<[number, () => Promise<void>]> = [];

  initializers: { [K in keyof Deps]: (env: Environment) => Promise<Deps[K]> } =
    {
      bus: async env => {
        const bus = new LocalBus<BusContext>();

        env.onTeardown(async () => {
          const pool = await env.get('pool');
          const nats = await env.get('nats');
          const logger = await env.get('logger');

          await pool.withConnection(async pg => {
            const tracer = opentelemetry.trace.getTracer('baseball-bat');
            const span = tracer.startSpan('shutdown context');

            await bus
              .createContext({ pg, nats, logger, span, session: null })
              .emit(shutdown);
            console.log('Shutting down!');
          });
        }, -1);

        return bus;
      },
      config: async env => env.config,
      redis: async env => {
        const client = redis.createClient({
          url: env.config.redisUrl,
        });

        await client.connect();

        env.onTeardown(async () => {
          await client.quit();
        });

        return client as redis.RedisClientType;
      },
      pool: async env => {
        const pool = new Pool(env.config.dbUrl);

        env.onTeardown(() => pool.end());

        return pool;
      },
      emailTransport: async () => {
        return {
          async sendEmail() {
            return;
          },
        };
      },
      minio: ({ config }) => setupMinioClient(config),
      nats: async env => {
        const nats = await connectNats(env.config);

        env.onTeardown(async () => {
          await nats.close();
        });

        return nats;
      },
      logger: async () =>
        winston.createLogger({
          transports: [
            new winston.transports.Console({
              format: winston.format.combine(
                winston.format.colorize({ level: true }),
                winston.format.printf(info => {
                  const module = info.module ? `[${info.module}] ` : '';
                  return `[${info.level}] ${module}${info.message}`;
                }),
              ),
            }),
          ],
        }),
    };

  deps: Partial<Deps> = {};

  async get<K extends keyof Deps>(thing: K): Promise<Deps[K]> {
    const existing = this.deps[thing];

    if (existing) {
      return existing;
    }

    return (this.deps[thing] = await this.initializers[thing](this));
  }

  constructor(public config: Config) {}

  onTeardown(hook: TeardownHook, priority = 0) {
    this.teardownHooks.splice(0, 0, [priority, hook]);
  }

  async teardown() {
    const hooks = this.teardownHooks.sort(([a], [b]) => a - b);

    for (const [, hook] of hooks) {
      await hook();
    }
  }
}

export class TestEnvironment {
  constructor(public env: Environment) {}

  mockProcedure = async <P extends ProcedureType<any, any>>(
    proc: P,
    impl?: ProcedureHandler<P, BusContext>,
    options?: Parameters<typeof mock.fn>[2],
  ) => {
    const bus = await this.env.get('bus');
    const orig = bus.getHandler(proc);
    const mockfn = mock.fn(orig, impl, options);
    bus.register(proc, mockfn, undefined, true);
    return mockfn.mock;
  };

  mockEvent = async <E extends EventType<any>>(
    event: E,
    impl?: EventHandler<E, BusContext>,
    options?: Parameters<typeof mock.fn>[2],
  ) => {
    const bus = await this.env.get('bus');
    const mockfn = mock.fn(undefined, impl, options);
    bus.on(event, mockfn as EventHandler<E, BusContext>);
    return mockfn.mock;
  };

  mockEmailTransport = async (
    impl?: IEmailTransport['sendEmail'],
    options?: Parameters<typeof mock.method>[3],
  ) => {
    const transport = await this.env.get('emailTransport');
    const mockfn = mock.method(
      transport,
      'sendEmail',
      impl as IEmailTransport['sendEmail'],
      options,
    );
    return mockfn.mock;
  };

  withContext = async <T>(
    fn: (ctx: ExecutionContext<BusContext>) => Promise<T>,
    payerId?: string,
  ): Promise<T> => {
    const pool = await this.env.get('pool');
    const bus = await this.env.get('bus');
    const nats = await this.env.get('nats');
    const logger = await this.env.get('logger');

    return pool.tryWithConnection(async pg => {
      const tracer = opentelemetry.trace.getTracer('baseball-bat');

      return tracer.startActiveSpan('context', async span => {
        const ctx = bus.createContext({
          pg,
          nats,
          logger,
          span,
          session: payerId
            ? {
                token: 'asd',
                authLevel: 'authenticated',
                payerId: internalIdentity(payerId),
              }
            : null,
        });
        const result = await fn(ctx);
        span.end();
        return result;
      });
    });
  };

  readFixture = async (name: string) => {
    const fixturePath = path.resolve(__dirname, 'fixtures', name);
    const content = await fs.readFile(fixturePath, 'utf-8');
    return content;
  };
}

export const createEnvironment = async (): Promise<Environment> => {
  const [postgres, redis, minio, nats] = await Promise.all([
    setupPostgres(),
    setupRedis(),
    setupMinio(),
    setupNats(),
  ]);

  const dataPath = await fs.mkdtemp(path.resolve(os.tmpdir(), 'bbat-'));

  const config = new Config({
    dbUrl: postgres.uri,
    userServiceUrl: 'https://users.tko-aly.fi',
    userServiceApiUrl: 'https://users.tko-aly.fi',
    userServiceConfig: {
      issuer: 'https://users.tko-aly.fi',
    },
    serviceId: 'FAKE_ID',
    serviceSecret: 'FAKE_SECRET',
    eventServiceUrl: '',
    eventServiceToken: '',
    jwtSecret: '',
    chromiumBinaryPath: '',
    stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? '',
    stripePublicKey: process.env.STRIPE_PUBLIC_KEY ?? '',
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
    appUrl: '',
    smtp: {
      host: '',
      port: 25,
      secure: false,
      user: '',
      password: '',
    },
    redisUrl: redis.uri,
    magicLinkSecret: '',
    assetPath: path.resolve(__dirname, '../assets'),
    dataPath,
    minioUrl: minio.uri,
    minioAccessKey: minio.accessKey,
    minioSecretKey: minio.secretKey,
    minioPublicUrl: minio.uri,
    minioBucket: 'baseball-bat',
    nats: {
      host: nats.config.host,
      port: nats.config.port,
      user: 'ruser',
      password: 'T0pS3cr3t',
    },
    integrationSecret: 'unsecure',
  });

  const environment = new Environment(config);

  environment.onTeardown(async () => {
    await fs.rm(dataPath, { recursive: true });
    await redis.container.stop();
    await postgres.container.stop();
    await minio.container.stop();
    await nats.container.stop();
  });

  return environment;
};

export const startServer = async (env: Environment) => {
  const app = await server({
    pool: await env.get('pool'),
    config: env.config,
    bus: await env.get('bus'),
    redis: await env.get('redis'),
    emailTransport: await env.get('emailTransport'),
    minio: await env.get('minio'),
    nats: await env.get('nats'),
    logger: await env.get('logger'),
  });

  const url = await new Promise<string>((resolve, reject) => {
    const listener = app.listen(0, () => {
      if (!listener) {
        reject();
        return;
      }

      const address = listener.address();

      if (!address || typeof address !== 'object') {
        reject();
        return;
      }

      resolve(`http://127.0.0.1:${address.port}`);
    });

    env.onTeardown(
      () => new Promise(resolve => listener.close(() => resolve())),
    );
  });

  const start = Date.now();

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res = await fetch(`${url}/api/health`);

    if (res.ok) {
      break;
    }

    await new Promise(resolve => setTimeout(resolve, 500));

    if (Date.now() - start > 10000) {
      throw new Error('Starting backend server exceeded the timeout of 10s!');
    }
  }

  return url;
};
