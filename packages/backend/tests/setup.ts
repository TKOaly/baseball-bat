import path from 'path';
import migrate from 'node-pg-migrate';
import { shutdown } from '../src/orchestrator';
import { GenericContainer } from 'testcontainers';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisClientType } from 'redis';
import * as redis from 'redis';
import { PgClient, PoolConnection } from '../src/db';
import { Config } from '../src/config';
import type { BusContext, ModuleDeps } from '../src/app';
import Stripe from 'stripe';
import {
  ExecutionContext,
  LocalBus,
  ProcedureHandler,
  EventType,
  ProcedureType,
  EventHandler,
} from '../src/bus';
import { JobService } from '../src/services/jobs';
import { describe, mock, test } from 'node:test';

import setupModules from '../src/services';
import { readFile } from 'fs/promises';
import * as fs from 'fs/promises';
import * as os from 'os';

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

  const client = PgClient.create(container.getConnectionUri());

  return {
    container,
    client,
  };
};

const setupRedis = async () => {
  const container = await new GenericContainer('redis')
    .withExposedPorts(6379)
    .start();

  await new Promise(resolve => setTimeout(resolve, 2000));

  const client = redis.createClient({
    socket: {
      host: container.getHost(),
      port: container.getMappedPort(6379),
    },
  });

  await client.connect();

  return { container, client };
};

export const createModuleDeps = async (): Promise<
  [ModuleDeps, () => Promise<void>]
> => {
  const [
    { container: redisContainer, client: redisClient },
    { container: postgresContainer, client: postgresClient },
  ] = await Promise.all([setupRedis(), setupPostgres()]);

  const dbUrl = postgresContainer.getConnectionUri();
  const redisUrl = `redis://${redisContainer.getHost()}:${redisContainer.getMappedPort(
    6379,
  )}`;

  const dataPath = await fs.mkdtemp(path.resolve(os.tmpdir(), 'bbat-'));

  const config = new Config({
    dbUrl,
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
    redisUrl,
    magicLinkSecret: '',
    assetPath: process.env.ASSET_PATH ?? './packages/backend/assets/',
    dataPath,
  });

  const stripeClient = new Stripe(config.stripeSecretKey, {
    apiVersion: '2020-08-27',
  });

  const bus = new LocalBus<BusContext>();

  const jobs = new JobService(
    config,
    redisClient as RedisClientType,
    bus,
    postgresClient.conn,
  );

  const emailTransport = {
    async sendEmail() {
      // Do not actually send emails in tests.
      // TODO: Provide a way to mock / spy this.
    },
  };

  const after = async () => {
    const conn = await postgresClient.conn.connect();
    await bus.emit({ pg: new PoolConnection(conn) }, shutdown);
    conn.release();
    await postgresClient.conn.end();
    await redisClient.quit();
    await redisContainer.stop();
    await postgresContainer.stop();
    await fs.rm(dataPath, { recursive: true });
  };

  return [
    {
      pg: postgresClient,
      redis: redisClient,
      stripe: stripeClient,
      bus,
      config,
      jobs,
      emailTransport,
    },
    after,
  ];
};

type MockProcedureFn = <P extends ProcedureType<any, any>>(
  p: P,
  impl?: ProcedureHandler<P, BusContext>,
  mockOpts?: Parameters<typeof mock.fn>[2],
) => ReturnType<typeof mock.fn>['mock'];
type MockEventFn = <E extends EventType<any>>(
  p: E,
  impl?: EventHandler<E, BusContext>,
  mockOpts?: Parameters<typeof mock.fn>[2],
) => ReturnType<typeof mock.fn>['mock'];

type CustomTestContext = {
  t: TestContext;
  bus: ExecutionContext<BusContext>;
  root: LocalBus<BusContext>;
  mockProcedure: MockProcedureFn;
  mockEvent: MockEventFn;
  readFixture: (path: string) => Promise<string>;
};

interface CustomTestHandler {
  (ctx: CustomTestContext): Promise<void> | void;
}

interface CustomTestFn {
  (name: string, test: CustomTestHandler): void;
  only(name: string, test: CustomTestHandler): void;
}

interface CustomSuiteContext {
  test: CustomTestFn;
}

interface CustomSuiteFn {
  (ctx: CustomSuiteContext): void;
}

type TestFn = NonNullable<Parameters<typeof test>[0]>;
type TestContext = Parameters<TestFn>[0];

export default (name: string, callback: CustomSuiteFn) =>
  describe(name, () => {
    const wrap: (fn: CustomTestHandler) => TestFn =
      fn => async (t: TestContext) => {
        const [deps, after] = await createModuleDeps();
        const conn = await deps.pg.conn.connect();

        await conn.query('BEGIN');

        const bus = deps.bus.createContext({
          pg: new PoolConnection(conn),
        });

        await setupModules(deps);

        const mockProcedure: MockProcedureFn = (proc, ...args) => {
          const orig = deps.bus.getHandler(proc);
          const mockfn = mock.fn(orig, ...args);
          deps.bus.register(proc, mockfn, undefined, true);
          return mockfn.mock;
        };

        const mockEvent: MockEventFn = (event, ...args) => {
          const mockfn = mock.fn(...args);
          deps.bus.on(event, mockfn);
          return mockfn.mock;
        };

        const readFixture = async (fixture: string) => {
          const fixturePath = path.resolve(__dirname, './fixtures', fixture);
          return readFile(fixturePath, 'utf8');
        };

        await fn({
          t,
          bus,
          root: deps.bus,
          mockProcedure,
          mockEvent,
          readFixture,
        });

        await conn.query('COMMIT');
        conn.release();
        await after();
      };

    const customTest: CustomTestFn = (name, fn) => test(name, wrap(fn));
    customTest.only = (name, fn) => test.only(name, wrap(fn));

    const context: CustomSuiteContext = {
      test: customTest,
    };

    callback(context);
  });
