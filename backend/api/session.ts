import { route, router } from 'typera-express'
import { PgClient } from '../db'
import { createAuthMiddleware } from '../auth-middleware'
import {
  setPaymentMethod,
  getPayerProfile,
  getPaymentMethod,
  getSetupIntentForUser,
} from '../services/payer'
import { userId } from '../../common/types'
import { badRequest, ok, redirect } from 'typera-express/response'
import Stripe from 'stripe'

const getSession = (pg: PgClient, jwtSecret: string) =>
  route
    .use(createAuthMiddleware(jwtSecret))
    .get('/')
    .handler(async ({ user }) => {
      const payerProfile = await getPayerProfile(pg, userId(user.id))
      const paymentMethod = await getPaymentMethod(pg, userId(user.id))

      return ok({
        payerProfile,
        paymentMethod,
        user,
      })
    })

const login = (usersApiUrl: string, usersApiService: string) =>
  route
    .get('/login')
    .handler(() =>
      redirect(302, `${usersApiUrl}?serviceIdentifier=${usersApiService}`)
    )

const getSetupIntent = (pg: PgClient, stripe: Stripe, jwtSecret: string) =>
  route
    .get('/setup-intent')
    .use(createAuthMiddleware(jwtSecret))
    .handler(async ({ user }) => {
      const secret = await getSetupIntentForUser(pg, stripe, userId(user.id))
      return ok(secret)
    })

const confirmCardSetup = (pg: PgClient, stripe: Stripe, appUrl: string) =>
  route.get('/confirm-card-setup').handler(async ({ req }) => {
    const setupIntentId = req.query.setup_intent
    if (!setupIntentId) {
      return badRequest('Missing setup_intent')
    }
    await setPaymentMethod(pg, stripe, req.query.setup_intent!.toString())

    return redirect(302, `${appUrl}/`)
  })

export default (
  pg: PgClient,
  stripe: Stripe,
  jwtSecret: string,
  usersApiUrl: string,
  usersApiService: string,
  appUrl: string
) =>
  router(
    getSession(pg, jwtSecret),
    login(usersApiUrl, usersApiService),
    getSetupIntent(pg, stripe, jwtSecret),
    confirmCardSetup(pg, stripe, appUrl)
  )
