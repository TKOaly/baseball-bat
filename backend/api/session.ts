import { route, router } from 'typera-express'
import { AuthService } from '../auth-middleware'
import { PayerService, } from '../services/payer'
import { internalIdentity } from '../../common/types'
import { badRequest, ok, redirect } from 'typera-express/response'
import { Inject, Service } from 'typedi'
import { Config } from '../config'
import base64url from 'base64url'

@Service()
export class SessionApi {
  @Inject(() => AuthService)
  authService: AuthService

  @Inject(() => PayerService)
  payerService: PayerService

  @Inject(() => Config)
  config: Config

  getSession() {
    return route
      .use(this.authService.createAuthMiddleware({ unauthenticated: true }))
      .get('/')
      .handler(async ({ session }) => {
        if (session.authLevel === 'unauthenticated') {
          return ok({
            authLevel: 'unauthenticated',
          })
        }

        const id = internalIdentity(session.payerId)

        const payerProfile = await this.payerService.getPayerProfileByInternalIdentity(id)
        const paymentMethod = await this.payerService.getPaymentMethod(id)
        const preferences = await this.payerService.getPayerPreferences(id)

        return ok({
          authLevel: session.authLevel,
          accessLevel: session.accessLevel,
          payerProfile,
          paymentMethod,
          preferences,
        })
      })
  }

  login() {
    return route
      .get('/login')
      .handler((ctx) => {
        const payload = base64url.encode(JSON.stringify({
          target: ctx.req.query.target,
        }))

        return redirect(302, `${this.config.userServiceUrl}?serviceIdentifier=${this.config.serviceId}&payload=${payload}`)
      })
  }

  getSetupIntent() {
    return route
      .get('/setup-intent')
      .use(this.authService.createAuthMiddleware())
      .handler(async ({ session }) => {
        const secret = await this.payerService.getSetupIntentForUser(internalIdentity(session.payerId))
        return ok(secret)
      })
  }

  confirmCardSetup() {
    return route
      .get('/confirm-card-setup')
      .handler(async ({ req }) => {
        const setupIntentId = req.query.setup_intent
        if (!setupIntentId) {
          return badRequest('Missing setup_intent')
        }
        await this.payerService.setPaymentMethod(req.query.setup_intent!.toString())

        return redirect(302, `${this.config.appUrl}/`)
      })
  }

  router() {
    return router(
      this.getSession(),
      this.login(),
      this.getSetupIntent(),
      this.confirmCardSetup()
    )
  }
}
