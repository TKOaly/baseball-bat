import assert from 'assert'
import * as dotenv from 'dotenv'

dotenv.config()

export type Config = {
  dbUrl: string
  userApiUrl: string
  userApiServiceId: string
  eventServiceUrl: string | null
  eventServiceToken: string | null
  jwtSecret: string
  stripeSecretKey: string
}

export const getConfig = (): Config => {
  const {
    POSTGRES_CONNECTION_STRING,
    USER_API_URL,
    USER_API_SERVICE_IDENTIFIER,
    EVENT_SERVICE_URL,
    EVENT_SERVICE_TOKEN,
    JWT_SECRET,
    STRIPE_SECRET_KEY,
  } = process.env

  assert(POSTGRES_CONNECTION_STRING, 'POSTGRES_CONNECTION_STRING must be set.')
  assert(USER_API_URL, 'USER_API_URL must be set.')
  assert(
    USER_API_SERVICE_IDENTIFIER,
    'USER_API_SERVICE_IDENTIFIER must be set.'
  )
  assert(JWT_SECRET, 'JWT_SECRET must be set.')
  assert(STRIPE_SECRET_KEY, 'STRIPE_SECRET_KEY must be set.')

  return {
    dbUrl: POSTGRES_CONNECTION_STRING,
    userApiUrl: USER_API_URL,
    userApiServiceId: USER_API_SERVICE_IDENTIFIER,
    eventServiceUrl: EVENT_SERVICE_URL ?? null,
    eventServiceToken: EVENT_SERVICE_TOKEN ?? null,
    jwtSecret: JWT_SECRET,
    stripeSecretKey: STRIPE_SECRET_KEY,
  }
}
