import { Inject, Service } from 'typedi';
import { Parser, route, router } from 'typera-express';
import { notFound, ok, unauthorized } from 'typera-express/response';
import * as t from 'io-ts';
import {
  emailIdentity,
  internalIdentity,
  PayerEmailPriority,
  tkoalyIdentity,
} from '../../common/types';
import { AuthService } from '../auth-middleware';
import { DebtService } from '../services/debt';
import { PayerService } from '../services/payer';
import { validateBody } from '../validate-middleware';
import { EmailService } from '../services/email';
import { Config } from '../config';
import { PaymentService } from '../services/payements';
import { body } from 'typera-express/parser';

@Service()
export class PayersApi {
  @Inject(() => PayerService)
  payerService: PayerService;

  @Inject(() => PaymentService)
  paymentService: PaymentService;

  @Inject(() => AuthService)
  authService: AuthService;

  @Inject(() => DebtService)
  debtService: DebtService;

  @Inject(() => EmailService)
  emailService: EmailService;

  @Inject(() => Config)
  config: Config;

  private getPayer() {
    return route
      .get('/:id')
      .use(this.authService.createAuthMiddleware({ accessLevel: 'normal' }))
      .handler(async ctx => {
        let { id } = ctx.routeParams;

        if (ctx.routeParams.id === 'me') {
          id = ctx.session.payerId;
        }

        if (
          ctx.session.accessLevel !== 'admin' &&
          ctx.routeParams.id !== 'me'
        ) {
          return unauthorized('Not authorized');
        }

        const payer = await this.payerService.getPayerProfileByInternalIdentity(
          internalIdentity(id),
        );

        if (payer) {
          return ok(payer);
        }

        return notFound();
      });
  }

  private createPayer() {
    return route
      .post('/')
      .use(this.authService.createAuthMiddleware())
      .use(
        body(
          t.type({
            name: t.string,
            email: t.string,
          }),
        ),
      )
      .handler(async ctx => {
        const result =
          await this.payerService.createPayerProfileFromEmailIdentity(
            emailIdentity(ctx.body.email),
            { name: ctx.body.name },
          );

        return ok(result);
      });
  }

  private getPayers() {
    return route
      .get('/')
      .use(this.authService.createAuthMiddleware())
      .handler(async () => {
        const payers = await this.payerService.getPayerProfiles();
        return ok(payers);
      });
  }

  private getPayerByEmail() {
    return route
      .get('/by-email/:email')
      .use(this.authService.createAuthMiddleware())
      .handler(async ctx => {
        const payer = await this.payerService.getPayerProfileByEmailIdentity(
          emailIdentity(ctx.routeParams.email),
        );

        if (!payer) {
          return notFound();
        }

        return ok(payer);
      });
  }

  private updatePayerPreferences() {
    return route
      .patch('/:id/preferences')
      .use(this.authService.createAuthMiddleware({ accessLevel: 'normal' }))
      .use(
        validateBody(
          t.partial({
            uiLanguage: t.union([t.literal('fi'), t.literal('en')]),
            emailLanguage: t.union([t.literal('fi'), t.literal('en')]),
          }),
        ),
      )
      .handler(async ctx => {
        if (
          ctx.session.accessLevel !== 'admin' &&
          ctx.routeParams.id !== 'me'
        ) {
          return unauthorized('Not authorized');
        }

        const id =
          ctx.routeParams.id === 'me'
            ? internalIdentity(ctx.session.payerId)
            : internalIdentity(ctx.routeParams.id);

        const updated = await this.payerService.updatePayerPreferences(
          id,
          ctx.body,
        );

        return ok(updated);
      });
  }

  private getPayerByTkoalyId() {
    return route
      .get('/by-tkoaly-id/:id(int)')
      .use(this.authService.createAuthMiddleware())
      .handler(async ctx => {
        const payer = await this.payerService.getPayerProfileByTkoalyIdentity(
          tkoalyIdentity(ctx.routeParams.id),
        );

        if (!payer) {
          return notFound();
        }

        return ok(payer);
      });
  }

  private getPayerDebts() {
    return route
      .get('/:id/debts')
      .use(this.authService.createAuthMiddleware({ accessLevel: 'normal' }))
      .handler(async ctx => {
        let { id } = ctx.routeParams;

        if (ctx.routeParams.id === 'me') {
          id = ctx.session.payerId;
        }

        if (
          ctx.session.accessLevel !== 'admin' &&
          ctx.routeParams.id !== 'me'
        ) {
          return unauthorized('Not authorized');
        }

        const includeDrafts =
          ctx.session.accessLevel === 'admin' &&
          ctx.req.query.includeDrafts === 'true';

        const debts = await this.debtService.getDebtsByPayer(
          internalIdentity(id),
          { includeDrafts, includeCredited: true },
        );

        return ok(debts);
      });
  }

  private getSessionPayer() {
    return route
      .get('/session')
      .use(this.authService.createAuthMiddleware({ accessLevel: 'normal' }))
      .handler(async ctx => {
        const payer = await this.payerService.getPayerProfileByInternalIdentity(
          internalIdentity(ctx.session.payerId),
        );

        if (payer) {
          return ok(payer);
        }

        return notFound();
      });
  }

  private getPayerEmails() {
    return route
      .get('/:id/emails')
      .use(
        this.authService.createAuthMiddleware({
          accessLevel: 'normal',
        }),
      )
      .handler(async ctx => {
        if (
          ctx.session.accessLevel !== 'admin' &&
          ctx.session.payerId !== ctx.routeParams.id
        ) {
          return unauthorized();
        }

        const emails = await this.payerService.getPayerEmails(
          internalIdentity(ctx.routeParams.id),
        );
        return ok(emails);
      });
  }

  private updatePayerEmails() {
    return route
      .patch('/:id/emails')
      .use(this.authService.createAuthMiddleware({ accessLevel: 'normal' }))
      .use(
        validateBody(
          t.array(
            t.type({
              email: t.string,
              priority: t.union([
                t.literal('primary'),
                t.literal('default'),
                t.literal('disabled'),
              ]),
            }),
          ),
        ),
      )
      .handler(async ctx => {
        let id = ctx.routeParams.id;

        if (ctx.session.accessLevel !== 'admin' && id !== 'me') {
          return unauthorized('Not authorized');
        }

        if (id === 'me') {
          id = ctx.session.payerId;
        }

        const iid = internalIdentity(id);

        const existing = await this.payerService.getPayerEmails(iid);

        for (const { email, priority } of ctx.body) {
          const foundIndex = existing.findIndex(e => e.email === email);
          const [found] = existing.splice(foundIndex, 1);

          if (found) {
            if (priority === found.priority) {
              continue;
            }

            await this.payerService.updatePayerEmailPriority(
              iid,
              email,
              priority,
            );
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
          await this.payerService.updatePayerEmailPriority(
            iid,
            email,
            'disabled',
          );
        }

        const results = await this.payerService.getPayerEmails(iid);

        return ok(results);
      });
  }

  private sendPaymentReminder() {
    return route
      .post('/:id/send-reminder')
      .use(
        validateBody(
          t.type({
            send: t.boolean,
            ignoreCooldown: t.boolean,
          }),
        ),
      )
      .use(this.authService.createAuthMiddleware())
      .handler(async ctx => {
        const id = internalIdentity(ctx.routeParams.id);
        const res = await this.debtService.sendPaymentRemindersByPayer(
          id,
          ctx.body,
        );

        return ok(res);
      });
  }

  private mergeProfiles() {
    return route
      .post('/:id/merge')
      .use(
        validateBody(
          t.type({
            mergeWith: t.string,
          }),
        ),
      )
      .use(this.authService.createAuthMiddleware())
      .handler(async ctx => {
        const primaryId = internalIdentity(ctx.routeParams.id);
        const secondaryId = internalIdentity(ctx.body.mergeWith);

        const debts = await this.payerService.mergeProfiles(
          primaryId,
          secondaryId,
        );

        return ok({
          affectedDebts: debts,
        });
      });
  }

  private updatePayer() {
    return route
      .patch('/:id')
      .use(
        Parser.body(
          t.partial({
            name: t.string,
            disabled: t.boolean,
            emails: t.array(
              t.type({
                email: t.string,
                priority: t.union([
                  t.literal('primary'),
                  t.literal('default'),
                  t.literal('disabled'),
                ]),
              }),
            ),
          }),
        ),
      )
      .handler(async ctx => {
        const payer = await this.payerService.getPayerProfileByInternalIdentity(
          internalIdentity(ctx.routeParams.id),
        );

        if (!payer) {
          return notFound();
        }

        if (ctx.body.name) {
          await this.payerService.updatePayerName(payer.id, ctx.body.name);
        }

        if (ctx.body.emails) {
          const added: Array<{ email: string; priority: PayerEmailPriority }> =
            [];
          const changed: Array<{
            email: string;
            priority: PayerEmailPriority;
          }> = [];

          ctx.body.emails.forEach(email => {
            const existing = payer.emails.find(
              entry => entry.email === email.email,
            );

            if (!existing) {
              added.push(email);
            } else if (existing.priority !== email.priority) {
              changed.push(email);
            }
          });

          const removed = payer.emails.filter(
            email =>
              !(ctx.body.emails ?? []).some(
                entry => entry.email === email.email,
              ),
          );

          for (const email of added) {
            await this.payerService.addPayerEmail({
              payerId: payer.id,
              email: email.email,
              source: 'other',
              priority: email.priority,
            });
          }

          for (const email of changed) {
            await this.payerService.updatePayerEmailPriority(
              payer.id,
              email.email,
              email.priority,
            );
          }

          for (const email of removed) {
            await this.payerService.updatePayerEmailPriority(
              payer.id,
              email.email,
              'disabled',
            );
          }
        }

        if (ctx.body.disabled !== undefined) {
          await this.payerService.updatePayerDisabledStatus(
            payer.id,
            ctx.body.disabled,
          );
        }

        const newPayer =
          await this.payerService.getPayerProfileByInternalIdentity(
            internalIdentity(ctx.routeParams.id),
          );

        return ok(newPayer);
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
      this.mergeProfiles(),
      this.updatePayer(),
      this.createPayer(),
    );
  }
}
