import 'reflect-metadata';
import anyTest, { TestFn } from 'ava';
import path from 'path';
import * as redis from 'redis';
import migrate from 'node-pg-migrate';
import Stripe from 'stripe';
import Container, { ContainerInstance } from 'typedi';
import { Config } from '../backend/config';
import { PgClient } from '../backend/db';
import { GenericContainer } from 'testcontainers';
import { PostgreSqlContainer } from '@testcontainers/postgresql';

export type AppTestFn = TestFn<{
  container: ContainerInstance,
}>;

export function createTestFunc(): AppTestFn {
  const test = anyTest as TestFn<{ container: ContainerInstance }>;

  test.beforeEach(async (t) => {
    const container = Container.of(t.title);

    const redisContainer = await new GenericContainer('redis').withExposedPorts(6379).start()
    const postgresContainer = await new PostgreSqlContainer().start();

    const dbUrl = postgresContainer.getConnectionUri();
    const redisUrl = `redis://${redisContainer.getHost()}:${redisContainer.getMappedPort(6379)}`;

    const pg = PgClient.create(dbUrl);

    await migrate({
      databaseUrl: dbUrl,
      migrationsTable: '__migrations',
      direction: 'up',
      dir: path.resolve(__dirname, '../migrations'),
      log: () => {},
    });

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

    container.set(Config, config);

    const redisClient = redis.createClient({
      url: redisUrl,
    });

    redisClient.connect();

    const stripeClient = new Stripe(config.stripeSecretKey, {
      apiVersion: '2020-08-27',
    });

    container.set('redis', redisClient);
    container.set(PgClient, pg);
    container.set('stripe', stripeClient);

    t.context.container = container;
  });

  test.afterEach(async (t) => {
    const { container } = t.context;
    const pg = container.get(PgClient);

    await pg.conn.end();
  });

  return test;
} 
