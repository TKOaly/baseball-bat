import { ApiDeps } from '@/api';
import { BusContext, ModuleDeps } from '@/app';
import * as redis from 'redis';
import { Config } from '@/config';
import setupServices from '@/services';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
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
import { PgClient, PoolConnection } from '@/db';
import { IEmailTransport } from '@/services/email';
import { JobService } from '@/services/jobs';
import Stripe from 'stripe';
import { authServiceFactory } from '@/auth-middleware';
import server from '@/server';
import { shutdown } from '@/orchestrator';
import { mock } from 'node:test';

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

type TeardownHook = () => Promise<void>;

type Deps = ApiDeps & ModuleDeps;

export class Environment {
  private teardownHooks: Array<() => Promise<void>> = [];

  initializers: { [K in keyof Deps]: (env: Environment) => Promise<Deps[K]> } =
    {
      bus: async env => {
        const bus = new LocalBus<BusContext>();

        env.onTeardown(async () => {
          const conn = await (await env.get('pg')).conn.connect();
          const pg = new PoolConnection(conn);
          await bus.createContext({ pg }).emit(shutdown);
          conn.release();
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
      auth: async env =>
        authServiceFactory({
          bus: await env.get('bus'),
          redis: await env.get('redis'),
          config: env.config,
        }),
      pg: async env => {
        const pg = PgClient.create(env.config.dbUrl);

        env.onTeardown(() => pg.conn.end());

        return pg;
      },
      jobs: async env =>
        new JobService(
          env.config,
          await env.get('redis'),
          await env.get('bus'),
          (await env.get('pg')).conn,
        ),
      stripe: async env =>
        new Stripe(env.config.stripeSecretKey, {
          apiVersion: '2020-08-27',
        }),
      emailTransport: async () => {
        return {
          async sendEmail() {
            return;
          },
        };
      },
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
  constructor(private env: Environment) {}

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
  ): Promise<T> => {
    const pg = await this.env.get('pg');
    const bus = await this.env.get('bus');
    const conn = await pg.conn.connect();

    await conn.query('BEGIN');

    const ctx = bus.createContext({
      pg: new PoolConnection(conn),
    });

    try {
      const result = await fn(ctx);
      await conn.query('COMMIT');
      return result;
    } finally {
      conn.release();
    }
  };

  readFixture = async (name: string) => {
    const fixturePath = path.resolve(__dirname, 'fixtures', name);
    const content = await fs.readFile(fixturePath, 'utf-8');
    return content;
  };
}

export const createEnvironment = async (): Promise<Environment> => {
  const postgres = await setupPostgres();
  const redis = await setupRedis();

  const dataPath = await fs.mkdtemp(path.resolve(os.tmpdir(), 'bbat-'));

  const config = new Config({
    dbUrl: postgres.uri,
    userServiceUrl: '',
    userServiceApiUrl: '',
    serviceId: '',
    eventServiceUrl: '',
    eventServiceToken: '',
    jwtSecret: '',
    chromiumBinaryPath: '',
    stripeSecretKey: '',
    stripeWebhookSecret: '',
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
  });

  const environment = new Environment(config);

  environment.onTeardown(async () => {
    await fs.rm(dataPath, { recursive: true });
  });
  environment.onTeardown(async () => {
    await redis.container.stop();
  });
  environment.onTeardown(async () => {
    await postgres.container.stop();
  });

  return environment;
};

export const startServices = async (env: Environment) => {
  await setupServices({
    pg: await env.get('pg'),
    config: env.config,
    bus: await env.get('bus'),
    redis: await env.get('redis'),
    stripe: await env.get('stripe'),
    jobs: await env.get('jobs'),
    emailTransport: await env.get('emailTransport'),
  });
};

export const startServer = async (env: Environment) => {
  const app = await server({
    pg: await env.get('pg'),
    config: env.config,
    bus: await env.get('bus'),
    redis: await env.get('redis'),
    stripe: await env.get('stripe'),
    jobs: await env.get('jobs'),
    auth: await env.get('auth'),
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