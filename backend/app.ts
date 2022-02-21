import express from 'express'
import { router } from 'typera-express'
import healthCheck from './api/health-check'
import { createEventsService } from './services/events'
import { getConfig } from './config'
import events from './api/events'
import auth from './api/auth'
import cookieParser from 'cookie-parser'
import { createUserService } from './services/users'
import Stripe from 'stripe'
import { createPgClient } from './db'
import session from './api/session'
import cors from 'cors'
import helmet, { HelmetOptions } from 'helmet'
import stripeEvents from './api/stripe-events'

const PORT = process.env.PORT ?? '5000'
const config = getConfig()

const helmetConfig: HelmetOptions = {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'", '*.stripe.com'],
      scriptSrc:
        process.env.NODE_ENV !== 'production'
          ? ["'self'", '*.stripe.com', "'unsafe-eval'"]
          : ["'self'", '*.stripe.com'],
      connectSrc:
        process.env.NODE_ENV !== 'production'
          ? ["'self'", 'ws://localhost:1234']
          : ["'self'"],
      frameAncestors: ['*.stripe.com'],
    },
  },
  crossOriginEmbedderPolicy: false,
}

const stripeClient = new Stripe(config.stripeSecretKey, {
  apiVersion: '2020-08-27',
})

const pg = createPgClient(config.dbUrl)

const eventsService = createEventsService(config)
const userService = createUserService(config)

const app = express()
  .use(helmet(helmetConfig))
  .use(
    cors({
      methods: ['GET', 'POST', 'OPTIONS'],
      origin: [config.appUrl],
    })
  )
  .use(
    '/api/stripe-events',
    express.raw({ type: 'application/json' }),
    stripeEvents(pg, stripeClient, config.stripeWebhookEndpointSecret).handler()
  )
  .use(express.json())
  .use(cookieParser())
  .use(
    '/api/session',
    session(
      pg,
      stripeClient,
      config.jwtSecret,
      config.userApiUrl,
      config.userApiServiceId
    ).handler()
  )
  .use(
    '/api/events',
    events(eventsService, pg, stripeClient, config.jwtSecret).handler()
  )
  .use(
    router(
      healthCheck,
      auth(userService, pg, stripeClient, config.jwtSecret)
    ).handler()
  )

if (process.env.NODE_ENV !== 'production') {
  app.use(
    '/:type(index|onboarding|update-payment-method|landing)',
    express.static('web-dist/index.html')
  )
  app.use(express.static('web-dist'))
}

app.listen(PORT, () => console.log(`backend istening on port ${PORT} 🚀`))

export default app
