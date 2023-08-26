import 'reflect-metadata';
import anyTest, { TestFn } from 'ava';
import { expect } from 'earl';
import path from 'path';
import * as redis from 'redis';
import migrate from 'node-pg-migrate';
import Stripe from 'stripe';
import Container, { ContainerInstance } from 'typedi';
import { Config } from '../backend/config';
import { PgClient } from '../backend/db';
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisClientType } from 'redis';
import { EventEmitter } from 'events';
import { AppBus } from '../backend/orchestrator';

export type AppTestFn = TestFn<{
  container: ContainerInstance,
  testcontainers: Array<StartedTestContainer>,
}>;

export function createTestFunc(): AppTestFn {
  const test = anyTest as AppTestFn;

  const setupPostgres = async () => {
    const container = await new PostgreSqlContainer().start();

    await migrate({
      databaseUrl: container.getConnectionUri(),
      migrationsTable: '__migrations',
      direction: 'up',
      dir: path.resolve(__dirname, '../../migrations'),
      log: () => {},
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

    await new Promise((resolve) => setTimeout(resolve, 2000));

    const client = redis.createClient({
      socket: {
        host: container.getHost(),
        port: container.getMappedPort(6379),
      },
    });

    await client.connect();

    return { container, client };
  };

  test.beforeEach(async (t) => {
    const [
      { container: redisContainer, client: redisClient },
      { container: postgresContainer, client: postgresClient },
    ] = await Promise.all([
        setupRedis(),
        setupPostgres(),
    ]);

    t.context.testcontainers = [redisContainer, postgresContainer];

    const dbUrl = postgresContainer.getConnectionUri();
    const redisUrl = `redis://${redisContainer.getHost()}:${redisContainer.getMappedPort(6379)}`;

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
      assetPath: '',
      dataPath: '',
    });

    const container = Container.of(t.title);

    container.set(Config, config);

    const stripeClient = new Stripe(config.stripeSecretKey, {
      apiVersion: '2020-08-27',
    });

    container.set('redis', redisClient);
    container.set(PgClient, postgresClient);
    container.set('stripe', stripeClient);

    t.context.container = container;
  });

  test.afterEach(async (t) => {
    const { container } = t.context;
    const pg = container.get(PgClient);
    const redis: RedisClientType = container.get('redis');

    const bus = container.get(AppBus);
    await bus.close();

    await redis.disconnect();
    await pg.conn.end();

    await Promise.all(t.context.testcontainers.map((c) => c.stop()));
  });

  return test;
} 

export function uuidValidator() {
  return expect.regex(/^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/);
}
