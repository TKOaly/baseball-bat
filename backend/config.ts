import assert from 'assert'
import * as dotenv from 'dotenv'
import { Service } from 'typedi'

dotenv.config()

interface IConfig {
  dbUrl: string
  userServiceUrl: string
  userServiceApiUrl: string
  serviceId: string
  eventServiceUrl: string | null
  eventServiceToken: string | null
  jwtSecret: string
  stripeSecretKey: string
  appUrl: string
  stripeWebhookEndpointSecret: string
  redisUrl: string
  emailDispatcher?: {
    url: string
    token: string
  }
  smtp?: {
    host: string
    port: number
    secure: boolean
    user?: string
    password?: string
  }
  magicLinkSecret: string
}

@Service()
export class Config implements IConfig {
  dbUrl: string = ''
  userServiceUrl: string = ''
  userServiceApiUrl: string = ''
  serviceId: string = ''
  eventServiceUrl: string | null = null
  eventServiceToken: string | null = null
  jwtSecret: string = ''
  stripeSecretKey: string = ''
  appUrl: string = ''
  stripeWebhookEndpointSecret: string = ''
  redisUrl: string
  emailDispatcher?: {
    url: string
    token: string
  }
  smtp?: {
    host: string
    port: number
    secure: boolean
    user?: string
    password?: string
  }
  magicLinkSecret: string = ''

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
      STRIPE_SECRET_KEY,
      STRIPE_WEBHOOK_ENDPOINT_SECRET,
      USER_SERVICE_URL,
      USER_SERVICE_API_URL,
      SERVICE_IDENTIFIER,
      MAGIC_LINK_SECRET,
    } = process.env

    assert(POSTGRES_CONNECTION_STRING, 'POSTGRES_CONNECTION_STRING must be set.')
    assert(USER_SERVICE_URL, 'USER_SERVICE_URL must be set.')
    assert(USER_SERVICE_API_URL, 'USER_SERVICE_API_URL must be set.')
    assert(
      SERVICE_IDENTIFIER,
      'SERVICE_IDENTIFIER must be set.'
    )
    assert(JWT_SECRET, 'JWT_SECRET must be set.')
    assert(STRIPE_SECRET_KEY, 'STRIPE_SECRET_KEY must be set.')
    assert(APP_URL, 'APP_URL must be set.')
    assert(
      STRIPE_WEBHOOK_ENDPOINT_SECRET,
      'STRIPE_WEBHOOK_ENDPOINT_SECRET must be set.'
    )

    const emailDispatcher = Config.getEmailDispatcherConfig()
    const smtp = Config.getSMTPConfig()

    return new Config({
      dbUrl: POSTGRES_CONNECTION_STRING,
      userServiceUrl: USER_SERVICE_URL,
      userServiceApiUrl: USER_SERVICE_API_URL,
      serviceId: SERVICE_IDENTIFIER,
      eventServiceUrl: EVENT_SERVICE_URL ?? null,
      eventServiceToken: EVENT_SERVICE_TOKEN ?? null,
      jwtSecret: JWT_SECRET,
      stripeSecretKey: STRIPE_SECRET_KEY,
      appUrl: APP_URL,
      stripeWebhookEndpointSecret: STRIPE_WEBHOOK_ENDPOINT_SECRET,
      emailDispatcher,
      smtp,
      redisUrl: REDIS_URL!,
      magicLinkSecret: MAGIC_LINK_SECRET!,
    })
  }

  static getEmailDispatcherConfig() {
    const { EMAIL_DISPATCHER_TOKEN, EMAIL_DISPATCHER_URL } = process.env

    if (!EMAIL_DISPATCHER_URL && !EMAIL_DISPATCHER_TOKEN) {
      return undefined;
    }

    return {
      url: EMAIL_DISPATCHER_TOKEN!,
      token: EMAIL_DISPATCHER_URL!,
    }
  }

  static getSMTPConfig() {
    const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASSWORD } = process.env

    if (!SMTP_HOST) {
      return undefined
    }

    return {
      host: SMTP_HOST!,
      port: parseInt(SMTP_PORT ?? '25', 10),
      secure: SMTP_SECURE === 'on',
      user: SMTP_USER,
      password: SMTP_PASSWORD,
    }
  }
}
