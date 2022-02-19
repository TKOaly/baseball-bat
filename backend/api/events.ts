import { Parser, route, router } from 'typera-express'
import { ok } from 'typera-express/response'
import { EventsService } from '../services/events'
import { tkoAlyUserId, userId } from '../../common/types'
import { createAuthMiddleware } from '../auth-middleware'
import { PgClient } from '../db'
import { getEventsWithPaymentStatus, payUsersEvents } from '../services/payer'
import Stripe from 'stripe'
import * as t from 'io-ts'

const getEvents = (
  eventService: EventsService,
  pg: PgClient,
  jwtSecret: string
) => {
  return route
    .get('/')
    .use(createAuthMiddleware(jwtSecret))
    .handler(async ({ user }) => {
      const events = await eventService.getEvents(tkoAlyUserId(user.upstreamId))
      const withStatus = await getEventsWithPaymentStatus(
        pg,
        userId(user.id),
        events
      )
      return ok(withStatus)
    })
}

const PayEventsBody = t.type({
  events: t.array(t.number),
})

const payEvents = (
  eventService: EventsService,
  pg: PgClient,
  stripe: Stripe,
  jwtSecret: string
) =>
  route
    .post('/pay')
    .use(createAuthMiddleware(jwtSecret))
    .use(Parser.body(PayEventsBody))
    .handler(async ({ body, user }) => {
      await payUsersEvents(
        pg,
        stripe,
        eventService,
        body.events,
        userId(user.id)
      )

      return ok({ ok: true })
    })

export default (
  eventService: EventsService,
  pg: PgClient,
  stripe: Stripe,
  jwtSecret: string
) =>
  router(
    getEvents(eventService, pg, jwtSecret),
    payEvents(eventService, pg, stripe, jwtSecret)
  )
