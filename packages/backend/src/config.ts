/* eslint-disable @typescript-eslint/no-non-null-assertion */

import assert from 'assert';
import * as dotenv from 'dotenv';

dotenv.config();

interface IConfig {
  dbUrl: string;
  userServiceUrl: string;
  userServiceApiUrl: string;
  serviceId: string;
  serviceSecret: string;
  assetPath: string;
  dataPath: string;
  chromiumBinaryPath: string | null;
  eventServiceUrl: string;
  eventServiceToken: string;
  jwtSecret: string;
  stripeSecretKey: string;
  stripeWebhookSecret: string;
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
}

export class Config implements IConfig {
  dbUrl = '';
  userServiceUrl = '';
  userServiceApiUrl = '';
  chromiumBinaryPath = null;
  serviceId = '';
  serviceSecret = '';
  eventServiceUrl = '';
  eventServiceToken = '';
  assetPath = '';
  dataPath = '';
  jwtSecret = '';
  stripeSecretKey = '';
  stripeWebhookSecret = '';
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
      STRIPE_WEBHOOK_SECRET,
      USER_SERVICE_URL,
      USER_SERVICE_API_URL,
      SERVICE_IDENTIFIER,
      MAGIC_LINK_SECRET,
      SERVICE_SECRET,
    } = process.env;

    assert(
      POSTGRES_CONNECTION_STRING,
      'POSTGRES_CONNECTION_STRING must be set.',
    );
    assert(USER_SERVICE_URL, 'USER_SERVICE_URL must be set.');
    assert(USER_SERVICE_API_URL, 'USER_SERVICE_API_URL must be set.');
    assert(ASSET_PATH, 'ASSET_PATH must be set.');
    assert(DATA_PATH, 'DATA_PATH must be set.');
    assert(SERVICE_IDENTIFIER, 'SERVICE_IDENTIFIER must be set.');
    assert(SERVICE_SECRET, 'SERVICE_SECRET must be set.');
    assert(JWT_SECRET, 'JWT_SECRET must be set.');
    assert(STRIPE_SECRET_KEY, 'STRIPE_SECRET_KEY must be set.');
    assert(APP_URL, 'APP_URL must be set.');
    assert(STRIPE_WEBHOOK_SECRET, 'STRIPE_WEBHOOK_SECRET must be set.');

    const emailDispatcher = Config.getEmailDispatcherConfig();
    const smtp = Config.getSMTPConfig();

    return new Config({
      dbUrl: POSTGRES_CONNECTION_STRING,
      userServiceUrl: USER_SERVICE_URL,
      userServiceApiUrl: USER_SERVICE_API_URL,
      serviceId: SERVICE_IDENTIFIER,
      serviceSecret: SERVICE_SECRET,
      eventServiceUrl: EVENT_SERVICE_URL ?? '',
      eventServiceToken: EVENT_SERVICE_TOKEN ?? '',
      jwtSecret: JWT_SECRET,
      chromiumBinaryPath: CHROMIUM_BINARY_PATH ?? null,
      stripeSecretKey: STRIPE_SECRET_KEY,
      stripeWebhookSecret: STRIPE_WEBHOOK_SECRET,
      appUrl: APP_URL,
      emailDispatcher,
      smtp,
      redisUrl: REDIS_URL!,
      magicLinkSecret: MAGIC_LINK_SECRET!,
      assetPath: ASSET_PATH,
      dataPath: DATA_PATH,
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
