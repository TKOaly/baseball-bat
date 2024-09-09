/* eslint-disable @typescript-eslint/no-non-null-assertion */

import assert from 'assert';
import * as dotenv from 'dotenv';
import { IssuerMetadata } from 'openid-client';

dotenv.config();

interface IConfig {
  dbUrl: string;
  userServiceUrl: string | null;
  userServiceApiUrl: string | null;
  userServiceConfig: IssuerMetadata | null;
  serviceId: string;
  serviceSecret: string;
  assetPath: string;
  dataPath: string;
  chromiumBinaryPath: string | null;
  eventServiceUrl: string | null;
  eventServiceToken: string | null;
  jwtSecret: string;
  stripeSecretKey: string | null;
  stripePublicKey: string | null;
  stripeWebhookSecret: string | null;
  minioUrl: string;
  minioPublicUrl: string;
  minioAccessKey: string;
  minioSecretKey: string;
  minioBucket: string;
  appUrl: string;
  redisUrl: string;
  emailDispatcher?: {
    url: string;
    token: string;
  };
  smtp?: {
    host: string;
    port: number;
    secure: boolean;
    user?: string;
    password?: string;
  };
  magicLinkSecret: string;
  integrationSecret: string | null;
  nats: {
    host: string;
    user: string;
    port: number;
    password: string;
  } | null;
}

export class Config implements IConfig {
  dbUrl = '';
  userServiceUrl = null;
  userServiceApiUrl = null;
  userServiceConfig = null;
  chromiumBinaryPath = null;
  serviceId = '';
  serviceSecret = '';
  eventServiceUrl = null;
  eventServiceToken = null;
  assetPath = '';
  dataPath = '';
  jwtSecret = '';
  stripeSecretKey = null;
  stripePublicKey = null;
  stripeWebhookSecret = null;
  minioUrl = '';
  minioPublicUrl = '';
  minioAccessKey = '';
  minioSecretKey = '';
  minioBucket = '';
  appUrl = '';
  redisUrl: string;
  emailDispatcher?: {
    url: string;
    token: string;
  };
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    user?: string;
    password?: string;
  };
  magicLinkSecret = '';
  integrationSecret = null;
  nats: IConfig['nats'] = null;

  constructor(config: IConfig) {
    Object.assign(this, config);
  }

  static get() {
    const {
      APP_URL,
      EVENT_SERVICE_TOKEN,
      EVENT_SERVICE_URL,
      JWT_SECRET,
      POSTGRES_CONNECTION_STRING,
      REDIS_URL,
      CHROMIUM_BINARY_PATH,
      ASSET_PATH,
      DATA_PATH,
      STRIPE_SECRET_KEY,
      STRIPE_PUBLIC_KEY,
      STRIPE_WEBHOOK_SECRET,
      USER_SERVICE_URL,
      USER_SERVICE_API_URL,
      SERVICE_IDENTIFIER,
      MAGIC_LINK_SECRET,
      SERVICE_SECRET,
      MINIO_URL,
      MINIO_PUBLIC_URL,
      MINIO_ACCESS_KEY,
      MINIO_SECRET_KEY,
      MINIO_BUCKET,
      INTEGRATION_SECRET,
      NATS_HOST,
      NATS_PORT,
      NATS_USER,
      NATS_PASSWORD,
    } = process.env;

    assert(
      POSTGRES_CONNECTION_STRING,
      'POSTGRES_CONNECTION_STRING must be set.',
    );
    assert(ASSET_PATH, 'ASSET_PATH must be set.');
    assert(DATA_PATH, 'DATA_PATH must be set.');
    assert(SERVICE_IDENTIFIER, 'SERVICE_IDENTIFIER must be set.');
    assert(SERVICE_SECRET, 'SERVICE_SECRET must be set.');
    assert(JWT_SECRET, 'JWT_SECRET must be set.');
    assert(APP_URL, 'APP_URL must be set.');
    assert(MINIO_URL, 'MINIO_URL must be set.');
    assert(MINIO_SECRET_KEY, 'MINIO_SECRET_KEY must be set.');
    assert(MINIO_ACCESS_KEY, 'MINIO_ACCESS_KEY must be set.');

    if (process.env.NODE_ENV !== 'development') {
      assert(USER_SERVICE_URL, 'USER_SERVICE_URL must be set.');
      assert(USER_SERVICE_API_URL, 'USER_SERVICE_API_URL must be set.');
      assert(STRIPE_SECRET_KEY, 'STRIPE_SECRET_KEY must be set.');
      assert(STRIPE_PUBLIC_KEY, 'STRIPE_PUBLIC_KEY must be set.');
      assert(STRIPE_WEBHOOK_SECRET, 'STRIPE_WEBHOOK_SECRET must be set.');
      assert(NATS_HOST, 'NATS_HOST must be set.');
      assert(NATS_USER, 'NATS_USER must be set.');
      assert(NATS_PASSWORD, 'NATS_PASSWORD must be set.');
      assert(INTEGRATION_SECRET, 'INTEGRATION_SECRET must be set.');
    }

    let nats: IConfig['nats'] = null;

    if (NATS_HOST && NATS_USER && NATS_PASSWORD) {
      nats = {
        host: NATS_HOST,
        port: NATS_PORT ? parseInt(NATS_PORT, 10) : 4222,
        user: NATS_USER,
        password: NATS_PASSWORD,
      };
    }

    const emailDispatcher = Config.getEmailDispatcherConfig();
    const smtp = Config.getSMTPConfig();

    return new Config({
      dbUrl: POSTGRES_CONNECTION_STRING,
      userServiceUrl: USER_SERVICE_URL ?? null,
      userServiceApiUrl: USER_SERVICE_API_URL ?? null,
      userServiceConfig: null,
      serviceId: SERVICE_IDENTIFIER,
      serviceSecret: SERVICE_SECRET,
      eventServiceUrl: EVENT_SERVICE_URL ?? '',
      eventServiceToken: EVENT_SERVICE_TOKEN ?? '',
      jwtSecret: JWT_SECRET,
      chromiumBinaryPath: CHROMIUM_BINARY_PATH ?? null,
      stripeSecretKey: STRIPE_SECRET_KEY ?? null,
      stripePublicKey: STRIPE_PUBLIC_KEY ?? null,
      stripeWebhookSecret: STRIPE_WEBHOOK_SECRET ?? null,
      appUrl: APP_URL,
      emailDispatcher,
      smtp,
      redisUrl: REDIS_URL!,
      magicLinkSecret: MAGIC_LINK_SECRET!,
      assetPath: ASSET_PATH,
      dataPath: DATA_PATH,
      minioUrl: MINIO_URL,
      minioPublicUrl: MINIO_PUBLIC_URL ?? MINIO_URL,
      minioAccessKey: MINIO_ACCESS_KEY,
      minioSecretKey: MINIO_SECRET_KEY,
      minioBucket: MINIO_BUCKET ?? 'baseball-bat',
      integrationSecret: INTEGRATION_SECRET ?? null,
      nats,
    });
  }

  static getEmailDispatcherConfig() {
    const { EMAIL_DISPATCHER_TOKEN, EMAIL_DISPATCHER_URL } = process.env;

    if (!EMAIL_DISPATCHER_URL && !EMAIL_DISPATCHER_TOKEN) {
      return undefined;
    }

    return {
      url: EMAIL_DISPATCHER_TOKEN!,
      token: EMAIL_DISPATCHER_URL!,
    };
  }

  static getSMTPConfig() {
    const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASSWORD } =
      process.env;

    if (!SMTP_HOST) {
      throw new Error('SMTP_HOST not defined');
    }

    return {
      host: SMTP_HOST,
      port: parseInt(SMTP_PORT ?? '25', 10),
      secure: SMTP_SECURE === 'on',
      user: SMTP_USER,
      password: SMTP_PASSWORD,
    };
  }
}
