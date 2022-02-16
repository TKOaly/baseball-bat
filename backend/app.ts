import express from 'express'
import { router } from 'typera-express'
import bodyParser from 'body-parser'
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

const PORT = process.env.PORT ?? '5000'
const config = getConfig()

const stripeClient = new Stripe(config.stripeSecretKey, {
  apiVersion: '2020-08-27',
})

const pg = createPgClient(config.dbUrl)

const eventsService = createEventsService(config)
const userService = createUserService(config)

const app = express()
  .use(bodyParser.json())
  .use(cookieParser())
  .use(
    router(
      healthCheck,
      events(eventsService),
      auth(userService, pg, stripeClient, config.jwtSecret),
      session(eventsService, pg, stripeClient, config.jwtSecret)
    ).handler()
  )

app.listen(PORT, () => console.log(`backend istening on port ${PORT} 🚀`))

export default app
