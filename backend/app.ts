import express from 'express'
import { router } from 'typera-express'
import healthCheck from './api/health-check'
import { Config } from './config'
import { EventsApi } from './api/events'
import { AuthApi } from './api/auth'
import { DebtApi } from './api/debt'
import { DebtCentersApi } from './api/centers'
import { PaymentsApi } from './api/payments'
import cookieParser from 'cookie-parser'
import { DebtService } from './services/debt'
import Stripe from 'stripe'
import { PgClient } from './db'
import { SessionApi } from './api/session'
import cors from 'cors'
import helmet, { HelmetOptions } from 'helmet'
import { StripeEventsApi } from './api/stripe-events'
import { Container } from 'typedi'
import 'reflect-metadata'
import { EventsService } from './services/events'
import { PayersApi } from './api/payers'
import { EmailApi } from './api/email'
import * as redis from 'redis'
import { createEmailDispatcherTransport, createSMTPTransport, EmailService, IEmailTransport } from './services/email'

const PORT = process.env.PORT ?? '5000'
const config = Config.get()

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

const pg = PgClient.create(config.dbUrl)

const redisClient = redis.createClient({
  url: config.redisUrl,
})

redisClient.connect()

let emailTransport: IEmailTransport

if (config.emailDispatcher) {
  emailTransport = createEmailDispatcherTransport(config.emailDispatcher)
} else {
  emailTransport = createSMTPTransport(config.smtp!)
}

Container.set(Config, config)
Container.set('stripe', stripeClient)
Container.set(PgClient, pg)
Container.set('redis', redisClient)
Container.set(EmailService, new EmailService(emailTransport, pg))

if (process.env.NODE_ENV === 'development') {
  //Container.set(EventsService, EventsService.createMock())
}

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
    Container.get(StripeEventsApi).router().handler()
  )
  .use(express.json())
  .use(cookieParser())
  .use(
    '/api/session',
    Container.get(SessionApi).router().handler(),
  )
  .use(
    '/api/events',
    Container.get(EventsApi).router().handler()
  )
  .use(
    '/api/debtCenters',
    Container.get(DebtCentersApi).router().handler()
  )

  .use(
    '/api/debt',
    Container.get(DebtApi).router().handler(),
  )
  .use(
    '/api/payers',
    Container.get(PayersApi).router().handler(),
  )
  .use(
    '/api/payments',
    Container.get(PaymentsApi).router().handler(),
  )
  .use(
    '/api/emails',
    Container.get(EmailApi).router().handler(),
  )
  .use(Container.get(AuthApi).router().handler())
  .use(
    router(
      healthCheck,
    ).handler()
  )

if (process.env.NODE_ENV !== 'production') {
  app.use(
    '/:type(index|onboarding|update-payment-method|auth|admin|settings)',
    express.static('web-dist/index.html')
  )
  app.use(
    '/payment/:id/details',
    express.static('web-dist/index.html')
  )
  app.use(
    '/payment/new',
    express.static('web-dist/index.html')
  )
  app.use(
    '/auth/email',
    express.static('web-dist/index.html')
  )
  app.use(
    '/auth/email/confirm/:id',
    express.static('web-dist/index.html')
  )
  app.use(
    '/admin/:rest*',
    express.static('web-dist/index.html')
  )
  app.use(express.static('web-dist'))
}

app.listen(PORT, () => console.log(`backend istening on port ${PORT} 🚀`))

export default app
