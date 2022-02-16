import { route } from 'typera-express'
import { internalServerError, redirect } from 'typera-express/response'
import { UserService } from '../services/users'
import { sign } from '../jwt'
import { createPayerProfile } from '../services/payer'
import { PgClient } from '../db'
import Stripe from 'stripe'

export default (
  userService: UserService,
  pg: PgClient,
  stripe: Stripe,
  jwtSecret: string
) =>
  route.get('/auth-completed').handler(async ({ req }) => {
    const upstreamUser = await userService.getUpstreamUser(req.cookies.token)
    const payerProfile = await createPayerProfile(pg, stripe, upstreamUser)

    if (!payerProfile) {
      return internalServerError()
    }

    const token = await sign(
      {
        id: payerProfile.id.id,
        upstreamId: upstreamUser.id,
        email: upstreamUser.email,
        screenName: upstreamUser.screenName,
      },
      jwtSecret
    )

    return redirect(302, `/?token=${token}`)
  })
