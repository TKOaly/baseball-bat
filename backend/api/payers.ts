import { Inject, Service } from "typedi";
import { route, router } from "typera-express";
import { notFound, ok, unauthorized } from "typera-express/response";
import * as t from 'io-ts'
import { emailIdentity, internalIdentity, payerPreferences, tkoalyIdentity } from "../../common/types";
import { AuthService } from "../auth-middleware";
import { DebtService } from "../services/debt";
import { PayerService } from "../services/payer";
import { validateBody } from "../validate-middleware";
import { EmailService } from "../services/email";
import { Config } from "../config";

@Service()
export class PayersApi {
  @Inject(() => PayerService)
  payerService: PayerService

  @Inject(() => AuthService)
  authService: AuthService

  @Inject(() => DebtService)
  debtService: DebtService

  @Inject(() => EmailService)
  emailService: EmailService

  @Inject(() => Config)
  config: Config

  private getPayer() {
    return route
      .get('/:id')
      .use(this.authService.createAuthMiddleware({ accessLevel: 'normal' }))
      .handler(async (ctx) => {
        let { id } = ctx.routeParams;

        if (ctx.routeParams.id === 'me') {
          id = ctx.session.payerId;
        }

        if (ctx.session.accessLevel !== 'admin' && ctx.routeParams.id !== 'me') {
          return unauthorized('Not authorized')
        }

        const payer = await this.payerService.getPayerProfileByInternalIdentity(internalIdentity(id))

        if (payer) {
          return ok(payer)
        }

        return notFound()
      })
  }

  private getPayers() {
    return route
      .get('/')
      .use(this.authService.createAuthMiddleware())
      .handler(async () => {
        const payers = await this.payerService.getPayerProfiles()
        return ok(payers)
      })
  }

  private getPayerByEmail() {
    return route
      .get('/by-email/:email')
      .use(this.authService.createAuthMiddleware())
      .handler(async (ctx) => {
        const payer = await this.payerService.getPayerProfileByEmailIdentity(emailIdentity(ctx.routeParams.email))

        if (!payer) {
          return notFound()
        }

        return ok(payer)
      })
  }

  private updatePayerPreferences() {
    return route
      .patch('/:id/preferences')
      .use(this.authService.createAuthMiddleware({ accessLevel: 'normal' }))
      .use(validateBody(t.partial({
        uiLanguage: t.union([t.literal('fi'), t.literal('en')]),
        emailLanguage: t.union([t.literal('fi'), t.literal('en')]),
      })))
      .handler(async (ctx) => {
        if (ctx.session.accessLevel !== 'admin' && ctx.routeParams.id !== 'me') {
          return unauthorized('Not authorized')
        }

        const id = ctx.routeParams.id === 'me'
          ? internalIdentity(ctx.session.payerId)
          : internalIdentity(ctx.routeParams.id)

        const updated = await this.payerService.updatePayerPreferences(id, ctx.body);

        return ok(updated);
      })
  }

  private getPayerByTkoalyId() {
    return route
      .get('/by-tkoaly-id/:id(int)')
      .use(this.authService.createAuthMiddleware())
      .handler(async (ctx) => {
        const payer = await this.payerService.getPayerProfileByTkoalyIdentity(tkoalyIdentity(ctx.routeParams.id))

        if (!payer) {
          return notFound()
        }

        return ok(payer)
      })
  }

  private getPayerDebts() {
    return route
      .get('/:id/debts')
      .use(this.authService.createAuthMiddleware({ accessLevel: 'normal' }))
      .handler(async (ctx) => {
        let { id } = ctx.routeParams;

        if (ctx.routeParams.id === 'me') {
          id = ctx.session.payerId;
        }

        if (ctx.session.accessLevel !== 'admin' && ctx.routeParams.id !== 'me') {
          return unauthorized('Not authorized')
        }

        const includeDrafts = ctx.session.accessLevel === 'admin' && ctx.req.query.includeDrafts === 'true'

        const debts = await this.debtService.getDebtsByPayer(internalIdentity(id), { includeDrafts, includeCredited: true });

        return ok(debts);
      })
  }

  private getSessionPayer() {
    return route
      .get('/session')
      .use(this.authService.createAuthMiddleware({ accessLevel: 'normal' }))
      .handler(async (ctx) => {
        const payer = await this.payerService.getPayerProfileByInternalIdentity(internalIdentity(ctx.session.payerId))

        if (payer) {
          return ok(payer)
        }

        return notFound()
      })
  }

  private getPayerEmails() {
    return route
      .get('/:id/emails')
      .use(this.authService.createAuthMiddleware({
        accessLevel: 'normal',
      }))
      .handler(async (ctx) => {
        if (ctx.session.accessLevel !== 'admin' && ctx.session.payerId !== ctx.routeParams.id) {
          return unauthorized()
        }

        const emails = await this.payerService.getPayerEmails(internalIdentity(ctx.routeParams.id))
        return ok(emails)
      })
  }

  private updatePayerEmails() {
    return route
      .patch('/:id/emails')
      .use(this.authService.createAuthMiddleware({ accessLevel: 'normal' }))
      .use(validateBody(t.array(t.type({
        email: t.string,
        priority: t.union([
          t.literal('primary'),
          t.literal('default'),
          t.literal('disabled'),
        ]),
      }))))
      .handler(async (ctx) => {
        let id = ctx.routeParams.id

        if (ctx.session.accessLevel !== 'admin' && id !== 'me') {
          return unauthorized('Not authorized')
        }

        if (id === 'me') {
          id = ctx.session.payerId
        }

        const iid = internalIdentity(id)

        const existing = await this.payerService.getPayerEmails(iid)

        for (const { email, priority } of ctx.body) {
          const foundIndex = existing.findIndex((e) => e.email === email);
          const [found] = existing.splice(foundIndex, 1);

          if (found) {
            if (priority === found.priority) {
              continue;
            }

            await this.payerService.updatePayerEmailPriority(iid, email, priority);
          } else {
            await this.payerService.addPayerEmail({
              payerId: iid,
              email,
              priority,
              source: 'user',
            });
          }
        }

        for (const { email } of existing) {
          await this.payerService.updatePayerEmailPriority(iid, email, 'disabled');
        }

        const results = await this.payerService.getPayerEmails(iid);

        return ok(results);
      })
  }

  private sendPaymentReminder() {
    return route
      .post('/:id/send-reminder')
      .use(this.authService.createAuthMiddleware())
      .handler(async (ctx) => {
        const id = internalIdentity(ctx.routeParams.id);
        const debts = await this.debtService.getDebtsByPayer(id);
        const email = await this.payerService.getPayerPrimaryEmail(id);

        if (!email) {
          throw new Error('No such user or no primary email for user ' + ctx.routeParams.id);
        }

        const overdue = debts.filter((debt) => debt.dueDate);

        if (overdue.length === 0) {
          return ok({
            messageSent: false,
            messageDebtCount: 0,
          })
        }

        await this.emailService.createEmail({
          recipient: email.email,
          subject: 'You have unpaid debts that are overdue',
          template: 'reminder-multiple',
          payload: {
            debts: overdue,
            link: this.config.appUrl,
          },
        });

        return ok({
          messageSent: true,
          messageDebtCount: overdue.length,
        })
      });
  }

  router() {
    return router(
      this.getPayerByEmail(),
      this.getPayer(),
      this.getPayerEmails(),
      this.getSessionPayer(),
      this.getPayerDebts(),
      this.getPayerByTkoalyId(),
      this.updatePayerPreferences(),
      this.updatePayerEmails(),
      this.getPayers(),
      this.sendPaymentReminder(),
    )
  }
}
