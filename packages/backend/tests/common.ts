import { ApiDeps } from '@/api';
import { BusContext } from '@/app';
import * as redis from 'redis';
import { Config } from '@/config';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { setupMinio as setupMinioClient } from '@/minio';
import fs from 'fs/promises';
import os from 'os';
import migrate from 'node-pg-migrate';
import path from 'path';
import { GenericContainer } from 'testcontainers';
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
import { JobService } from '@/modules/jobs';
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
    .start();

  const uri = `redis://${container.getHost()}:${container.getMappedPort(6379)}`;

  return { container, uri };
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
  private teardownHooks: Array<() => Promise<void>> = [];

  initializers: { [K in keyof Deps]: (env: Environment) => Promise<Deps[K]> } =
    {
      bus: async env => {
        const bus = new LocalBus<BusContext>();

        env.onTeardown(async () => {
          const pool = await env.get('pool');

          await pool.withConnection(pg =>
            bus.createContext({ pg, session: null }).emit(shutdown),
          );
        });

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
      jobs: async env => {
        const pool = await env.get('pool');
        const bus = await env.get('bus');

        return new JobService(env.config, bus, pool);
      },
      emailTransport: async () => {
        return {
          async sendEmail() {
            return;
          },
        };
      },
      minio: ({ config }) => setupMinioClient(config),
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

  onTeardown(hook: TeardownHook) {
    this.teardownHooks.splice(0, 0, hook);
  }

  async teardown() {
    for (const hook of this.teardownHooks) {
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

    return pool.tryWithConnection(async pg => {
      const ctx = bus.createContext({
        pg,
        session: payerId
          ? {
              token: 'asd',
              authLevel: 'authenticated',
              payerId: internalIdentity(payerId),
            }
          : null,
      });

      return await fn(ctx);
    });
  };

  readFixture = async (name: string) => {
    const fixturePath = path.resolve(__dirname, 'fixtures', name);
    const content = await fs.readFile(fixturePath, 'utf-8');
    return content;
  };
}

export const createEnvironment = async (): Promise<Environment> => {
  const [postgres, redis, minio] = await Promise.all([
    setupPostgres(),
    setupRedis(),
    setupMinio(),
  ]);

  const dataPath = await fs.mkdtemp(path.resolve(os.tmpdir(), 'bbat-'));

  const config = new Config({
    dbUrl: postgres.uri,
    userServiceUrl: 'https://users.tko-aly.fi',
    userServiceApiUrl: 'https://users.tko-aly.fi',
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
  });

  const environment = new Environment(config);

  environment.onTeardown(async () => {
    await fs.rm(dataPath, { recursive: true });
    await redis.container.stop();
    await postgres.container.stop();
    await minio.container.stop();
  });

  return environment;
};

export const startServer = async (env: Environment) => {
  const app = await server({
    pool: await env.get('pool'),
    config: env.config,
    bus: await env.get('bus'),
    redis: await env.get('redis'),
    jobs: await env.get('jobs'),
    emailTransport: await env.get('emailTransport'),
    minio: await env.get('minio'),
  });

  return new Promise<string>((resolve, reject) => {
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
};
