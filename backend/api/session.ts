import { route, router } from 'typera-express';
import { AuthService } from '../auth-middleware';
import { PayerService } from '../services/payer';
import { internalIdentity } from '../../common/types';
import { ok, redirect, unauthorized } from 'typera-express/response';
import { Inject, Service } from 'typedi';
import { Config } from '../config';
import base64url from 'base64url';

@Service()
export class SessionApi {
  @Inject(() => AuthService)
    authService: AuthService;

  @Inject(() => PayerService)
    payerService: PayerService;

  @Inject(() => Config)
    config: Config;

  getSession() {
    return route
      .use(this.authService.createAuthMiddleware({ unauthenticated: true }))
      .get('/')
      .handler(async ({ session, req }) => {
        if (session.authLevel === 'unauthenticated') {
          return ok({
            authLevel: 'unauthenticated',
          });
        }

        const id = internalIdentity(session.payerId);

        const payerProfile = await this.payerService.getPayerProfileByInternalIdentity(id);
        const preferences = await this.payerService.getPayerPreferences(id);

        if (!req.cookies.token) {
          return unauthorized();
        }

        const tokenPayload = JSON.parse(Buffer.from(req.cookies.token.split('.')[1], 'base64').toString());

        if (tokenPayload.authenticatedTo.split(',').indexOf(this.config.serviceId) === -1) {
          return unauthorized();
        }

        return ok({
          authLevel: session.authLevel,
          accessLevel: session.accessLevel,
          payerProfile,
          preferences,
        });
      });
  }

  login() {
    return route
      .get('/login')
      .handler((ctx) => {
        const payload = base64url.encode(JSON.stringify({
          target: ctx.req.query.target,
        }));

        let redirectUrl = null;

        if (ctx.req.query.target === 'welcome' && typeof ctx.req.query.token === 'string') {
          redirectUrl = `${this.config.appUrl}/api/auth/merge?token=${encodeURIComponent(ctx.req.query.token)}`;
        }

        return redirect(302, `${this.config.userServiceUrl}?serviceIdentifier=${this.config.serviceId}&payload=${payload}${redirectUrl ? `&loginRedirect=${encodeURIComponent(redirectUrl)}` : ''}`);
      });
  }

  /*getSetupIntent() {
    return route
      .get('/setup-intent')
      .use(this.authService.createAuthMiddleware())
      .handler(async ({ session }) => {
        const secret = await this.payerService.getSetupIntentForUser(internalIdentity(session.payerId))
        return ok(secret)
      })
  }*/

  /*confirmCardSetup() {
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
  }*/

  router() {
    return router(
      this.getSession(),
      this.login(),
      //this.getSetupIntent(),
      //this.confirmCardSetup()
    );
  }
}
