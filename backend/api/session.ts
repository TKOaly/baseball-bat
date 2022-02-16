import { route } from 'typera-express'
import { PgClient } from '../db'
import { EventsService } from '../services/events'
import { createAuthMiddleware } from '../auth-middleware'
import Stripe from 'stripe'
import { getPayerProfile, getPaymentMethod } from '../services/payer'
import { userId } from '../../common/types'
import { ok } from 'typera-express/response'

export default (
  eventService: EventsService,
  pg: PgClient,
  stripe: Stripe,
  jwtSecret: string
) => {
  return route
    .use(createAuthMiddleware(jwtSecret))
    .get('/session')
    .handler(async ({ req, user }) => {
      const payerProfile = await getPayerProfile(pg, userId(user.id))
      const paymentMethod = await getPaymentMethod(pg, userId(user.id))

      return ok({
        payerProfile,
        paymentMethod,
        user,
      })
    })
}
