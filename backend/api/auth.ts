import { router, route, Router } from 'typera-express'
import { internalServerError, redirect, ok, badRequest, notFound, unauthorized } from 'typera-express/response'
import { UsersService } from '../services/users'
import { sign } from '../jwt'
import { PayerService } from '../services/payer'
import { EmailService } from '../services/email'
import { PgClient } from '../db'
import { v4 as uuid } from 'uuid'
import Stripe from 'stripe'
import { Inject, Service } from 'typedi'
import { Config } from '../config'
import { emailIdentity, internalIdentity, TkoalyIdentity, tkoalyIdentity } from '../../common/types'
import { validateBody } from '../validate-middleware'
import * as t from 'io-ts'
import { randomElem } from 'fp-ts/lib/Random'
import { split } from 'fp-ts/lib/string'
import { flow, pipe } from 'fp-ts/lib/function'
import { map, range, reduce } from 'fp-ts/lib/NonEmptyArray'
import { commandOptions, RedisClientType } from 'redis'
import { AccessLevel, AuthService } from '../auth-middleware'
import { MagicLinkService } from '../services/magic-links'

const sendAuthCodeBody = t.type({
  email: t.string
})

const validateAuthCodeBody = t.type({
  id: t.string,
  code: t.string,
})

@Service()
export class AuthApi {
  @Inject(() => UsersService)
  usersService: UsersService

  @Inject(() => MagicLinkService)
  magicLinkService: MagicLinkService

  @Inject(() => PayerService)
  payerService: PayerService

  @Inject(() => PgClient)
  pg: PgClient

  @Inject('stripe')
  stripe: Stripe

  @Inject('redis')
  redis: RedisClientType

  @Inject(() => Config)
  config: Config

  @Inject(() => EmailService)
  emailService: EmailService

  @Inject(() => AuthService)
  authService: AuthService

  private authCompleted() {
    return route
      .get('/auth-completed')
      .handler(async ({ req }) => {
        const upstreamUser = await this.usersService.getUpstreamUser(req.cookies.token)
        const payerProfile = await this.payerService.createPayerProfileFromTkoalyUser(upstreamUser)

        if (!payerProfile) {
          return internalServerError()
        }

        const sessionToken = await this.authService.createSession();
        const { token } = await this.authService.createAuthToken(payerProfile.id, sessionToken)
        await this.authService.resolveAuthToken(token);

        return redirect(302, `${this.config.appUrl}/?token=${token}`)
      })
  }

  private getUsers() {
    return route
      .get('/api/users')
      .use(this.authService.createAuthMiddleware())
      .handler(async ({ req }) => {
        const users = await this.usersService.getUsers(req.cookies.token);

        return ok(users);
      })
  }

  private getUser() {
    return route
      .get('/api/users/:id')
      .use(this.authService.createAuthMiddleware({
        accessLevel: 'normal'
      }))
      .handler(async (ctx) => {
        let userId: TkoalyIdentity | 'me'

        if (ctx.session.accessLevel !== 'admin' && ctx.routeParams.id !== 'me') {
          return unauthorized()
        }

        if (ctx.routeParams.id === 'me') {
          const profile = await this.payerService.getPayerProfileByInternalIdentity(internalIdentity(ctx.session.payerId))

          if (profile && profile.tkoalyUserId) {
            userId = profile?.tkoalyUserId
          } else {
            return notFound()
          }
        } else {
          try {
            userId = tkoalyIdentity(parseInt(ctx.routeParams.id))
          } catch {
            return notFound()
          }
        }

        const user = await this.usersService.getUpstreamUserById(userId, ctx.req.cookies.token);

        if (!user) {
          return notFound()
        }

        return ok(user)
      })
  }

  private initSession() {
    return route
      .post('/api/auth/init')
      .handler(async () => {
        const token = await this.authService.createSession();
        return ok({ token })
      })
  }

  private mergeSession() {
    return route
      .get('/api/auth/merge')
      .use(this.authService.createAuthMiddleware({
        accessLevel: 'normal',
        allowQueryToken: true,
      }))
      .handler(async ({ req, session }) => {
        const upstreamUser = await this.usersService.getUpstreamUser(req.cookies.token)
        const associatedProfile = await this.payerService.getPayerProfileByTkoalyIdentity(tkoalyIdentity(upstreamUser.id))

        if (associatedProfile) {
          await this.payerService.mergeProfiles(associatedProfile.id, internalIdentity(session.payerId))
        } else {
          await this.payerService.setProfileTkoalyIdentity(internalIdentity(session.payerId), tkoalyIdentity(upstreamUser.id))
        }

        await this.payerService.updatePayerPreferences(internalIdentity(session.payerId), {
          hasConfirmedMembership: true,
        })

        return redirect(302, `${this.config.appUrl}`)
      })
  }

  private authenticateSession() {
    return route
      .post('/api/auth/authenticate')
      .use(validateBody(t.type({
        id: t.string,
        remote: t.boolean,
      })))
      .use(this.authService.createAuthMiddleware({
        unauthenticated: true,
      }))
      .handler(async ({ body, session, req }) => {
        const authenticated = await this.authService.getAuthTokenStatus(body.id)

        if (!authenticated) {
          console.log('Not authenticated!')
          return unauthorized()
        }

        const payerId = await this.authService.getAuthTokenPayerId(body.id)

        if (!payerId) {
          console.log('No such user')
          return unauthorized()
        }

        const payerProfile = await this.payerService.getPayerProfileByInternalIdentity(payerId)

        if (!payerProfile) {
          console.log('Could not fetch user')
          return unauthorized()
        }

        let sessionToken: string | null = session.token

        if (body.remote) {
          sessionToken = await this.authService.getAuthTokenSession(body.id)
        }

        if (!sessionToken) {
          console.log('No remote session')
          return badRequest()
        }

        await this.authService.authenticate(sessionToken, payerId, 'email', req.cookies.token)

        console.log(`Authenticated session ${sessionToken} with auth token ${body.id}`)

        return ok();
      })
  }

  private auhtenticateRemoteSession() {
  }

  private destroySession() {
    return route
      .post('/api/auth/destroy-session')
      .use(this.authService.createAuthMiddleware({
        unauthenticated: true,
      }))
      .handler(async (ctx) => {
        await this.authService.destroySession(ctx.session.token);

        return ok();
      })
  }

  private sendAuthCode() {
    return route
      .post('/api/auth/request-code')
      .use(this.authService.createAuthMiddleware({
        unauthenticated: true,
      }))
      .use(validateBody(sendAuthCodeBody))
      .handler(async ({ body, session }) => {
        const payer = await this.payerService.getPayerProfileByEmailIdentity(emailIdentity(body.email))

        if (!payer) {
          return notFound()
        }

        const { token, code, secret } = await this.authService.createAuthToken(payer.id, session.token)

        await this.emailService.sendEmailDirect({
          recipient: body.email,
          subject: 'Your Authentication Code',
          template: 'auth-code',
          payload: {
            code,
            link: await this.magicLinkService.createMagicLink({
              path: `/api/auth/confirm?id=${token}&secret=${secret}`,
              email: body.email,
              authenticate: true,
              oneTime: true,
            }),
          },
        })

        return ok({ id: token })
      })
  }

  private validateAuthCode() {
    return route
      .post('/api/auth/validate-code')
      .use(this.authService.createAuthMiddleware({
        unauthenticated: true,
      }))
      .use(validateBody(validateAuthCodeBody))
      .handler(async ({ body }) => {
        const valid = await this.authService.validateAuthTokenCode(body.id, body.code)

        if (valid) {
          await this.authService.resolveAuthToken(body.id)

          return ok({ success: true })
        }

        return ok({ success: false })
      })
  }

  private confirmAuthWithLink() {
    return route
      .get('/api/auth/confirm')
      .handler(async ({ req }) => {
        if (typeof req.query.id !== 'string' || typeof req.query.secret !== 'string') {
          return badRequest()
        }

        const valid = await this.authService.validateAuthTokenSecret(req.query.id, req.query.secret)

        if (!valid) {
          return unauthorized({})
        }

        await this.authService.resolveAuthToken(req.query.id)

        return redirect(302, `${this.config.appUrl}/auth/email/confirm/${req.query.id}`)
      })
  }

  private pollAuthStatus() {
    return route
      .post('/api/auth/poll-status')
      .use(validateBody(t.type({ id: t.string })))
      .handler(async ({ body }) => {
        return ok({
          authenticated: await this.authService.getAuthTokenStatus(body.id, 3),
        })
      })
  }

  private renderTemplate() {
    return route
      .get('/template/:name/:type')
      .handler(async (ctx) => {
        if (ctx.routeParams.type !== 'html' && ctx.routeParams.type !== 'text') {
          return badRequest()
        }

        return ok(this.emailService.renderTemplate(ctx.routeParams.name, ctx.routeParams.type, {}))
      })
  }

  router(): Router {
    return router(
      this.getUsers(),
      this.authCompleted(),
      this.validateAuthCode(),
      this.pollAuthStatus(),
      this.sendAuthCode(),
      this.confirmAuthWithLink(),
      this.renderTemplate(),
      this.initSession(),
      this.authenticateSession(),
      this.getUser(),
      this.destroySession(),
      this.mergeSession()
    )
  }
}
