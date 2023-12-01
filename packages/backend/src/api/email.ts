import { Inject, Service } from 'typedi';
import { route, router } from 'typera-express';
import { notFound, ok } from 'typera-express/response';
import { AuthService } from '../auth-middleware';
import { EmailService } from '../services/email';
import { validateBody } from '../validate-middleware';
import * as t from 'io-ts';

@Service()
export class EmailApi {
  @Inject(() => EmailService)
  emailService: EmailService;

  @Inject(() => AuthService)
  authService: AuthService;

  private getEmails() {
    return route
      .get('/')
      .use(this.authService.createAuthMiddleware())
      .handler(async () => {
        const emails = await this.emailService.getEmails();
        return ok(emails);
      });
  }

  private getEmailsByDebt() {
    return route
      .get('/by-debt/:debt')
      .use(this.authService.createAuthMiddleware())
      .handler(async ctx => {
        const emails = await this.emailService.getEmailsByDebt(
          ctx.routeParams.debt,
        );
        return ok(emails);
      });
  }

  private getEmail() {
    return route
      .get('/:id')
      .use(this.authService.createAuthMiddleware())
      .handler(async ctx => {
        const email = await this.emailService.getEmail(ctx.routeParams.id);
        return ok(email);
      });
  }

  private renderEmail() {
    return route.get('/:id/render').handler(async ctx => {
      const email = await this.emailService.getEmail(ctx.routeParams.id);

      if (!email) {
        return notFound();
      }

      ctx.res.setHeader('Content-Security-Policy', "frame-ancestors 'self'");

      if (email.html) {
        ctx.res.setHeader('Content-Type', 'text/html');
        return ok(email.html);
      } else {
        ctx.res.setHeader('Content-Type', 'text/text');
        return ok(email.text);
      }
    });
  }

  private sendEmails() {
    return route
      .post('/send')
      .use(this.authService.createAuthMiddleware())
      .use(validateBody(t.type({ ids: t.array(t.string) })))
      .handler(async ({ body }) => {
        await Promise.all(
          body.ids.map(async id => {
            await this.emailService.sendEmail(id);
          }),
        );

        return ok();
      });
  }

  router() {
    return router(
      this.getEmails(),
      this.getEmail(),
      this.renderEmail(),
      this.sendEmails(),
      this.getEmailsByDebt(),
    );
  }
}
