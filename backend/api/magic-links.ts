import { toNullable } from 'fp-ts/lib/Option';
import { Inject, Service } from 'typedi';
import { route, router } from 'typera-express';
import { redirect } from 'typera-express/response';
import { emailIdentity } from '../../common/types';
import { AuthService } from '../auth-middleware';
import { MagicLinkService } from '../services/magic-links';
import { PayerService } from '../services/payer';

@Service()
export class MagicLinksApi {
  @Inject(() => MagicLinkService)
  magicLinkService: MagicLinkService;

  @Inject(() => AuthService)
  authService: AuthService;

  @Inject(() => PayerService)
  payerService: PayerService;

  private handleMagicLink() {
    return route
      .get('/magic/:payload')
      .use(
        this.authService.createAuthMiddleware({
          unauthenticated: true,
        }),
      )
      .handler(async ctx => {
        const magic_link = toNullable(
          this.magicLinkService.decodeMagicLink(ctx.routeParams.payload),
        );

        if (!magic_link) {
          return redirect(302, '/magic/invalid');
        }

        const isValid =
          await this.magicLinkService.validateMagicLink(magic_link);

        if (!isValid) {
          return redirect(302, '/magic/invalid');
        }

        if (magic_link.payload.authenticate) {
          let payerId;

          if (magic_link.payload.profileId) {
            payerId = magic_link.payload.profileId;
          }

          if (magic_link.payload.email) {
            const profile =
              await this.payerService.getPayerProfileByEmailIdentity(
                emailIdentity(magic_link.payload.email),
              );

            if (profile) {
              payerId = profile.id;
            }
          }

          if (!payerId) {
            return redirect(302, '/magic/invalid');
          }

          this.authService.authenticate(
            ctx.session.token,
            payerId,
            'magic-link',
            ctx.req.cookies.token,
          );
        }

        return redirect(302, magic_link.payload.path);
      });
  }

  router() {
    return router(this.handleMagicLink());
  }
}
