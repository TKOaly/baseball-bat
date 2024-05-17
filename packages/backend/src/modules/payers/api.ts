import { Parser, router } from 'typera-express';
import { forbidden, notFound, ok, unauthorized } from 'typera-express/response';
import * as payerService from '@/modules/payers/definitions';
import auth from '@/auth-middleware';
import * as debtService from '@/modules/debts/definitions';
import * as t from 'io-ts';
import {
  emailIdentity,
  internalIdentity,
  paginationQuery,
  PayerEmailPriority,
  tkoalyIdentity,
} from '@bbat/common/build/src/types';
import { validateBody } from '@/validate-middleware';
import { body } from 'typera-express/parser';
import { RouterFactory } from '@/module';

const factory: RouterFactory = route => {
  const getPayer = route
    .get('/:id')
    .use(auth({ accessLevel: 'normal' }))
    .handler(async ({ bus, ...ctx }) => {
      let id;

      if (ctx.routeParams.id === 'me') {
        id = ctx.session.payerId;
      } else {
        id = internalIdentity(ctx.routeParams.id);
      }

      if (ctx.session.accessLevel !== 'admin' && ctx.routeParams.id !== 'me') {
        return unauthorized('Not authorized');
      }

      const payer = await bus.exec(
        payerService.getPayerProfileByInternalIdentity,
        id,
      );

      if (payer) {
        return ok(payer);
      }

      return notFound();
    });

  const createPayer = route
    .post('/')
    .use(auth())
    .use(
      body(
        t.type({
          name: t.string,
          email: t.string,
        }),
      ),
    )
    .handler(async ({ bus, ...ctx }) => {
      const result = await bus.exec(
        payerService.createPayerProfileFromEmailIdentity,
        {
          id: emailIdentity(ctx.body.email),
          name: ctx.body.name,
        },
      );

      return ok(result);
    });

  const getPayers = route
    .get('/')
    .use(auth())
    .use(Parser.query(paginationQuery))
    .handler(async ({ bus, query }) => {
      const payers = await bus.exec(payerService.getPayerProfiles, query);
      return ok(payers);
    });

  const getPayerByEmail = route
    .get('/by-email/:email')
    .use(auth())
    .handler(async ({ bus, ...ctx }) => {
      const payer = await bus.exec(
        payerService.getPayerProfileByEmailIdentity,
        emailIdentity(ctx.routeParams.email),
      );

      if (!payer) {
        return notFound();
      }

      return ok(payer);
    });

  const updatePayerPreferences = route
    .patch('/:id/preferences')
    .use(auth({ accessLevel: 'normal' }))
    .use(
      validateBody(
        t.partial({
          uiLanguage: t.union([t.literal('fi'), t.literal('en')]),
          emailLanguage: t.union([t.literal('fi'), t.literal('en')]),
        }),
      ),
    )
    .handler(async ({ bus, ...ctx }) => {
      if (ctx.session.accessLevel !== 'admin' && ctx.routeParams.id !== 'me') {
        return unauthorized('Not authorized');
      }

      const id =
        ctx.routeParams.id === 'me'
          ? ctx.session.payerId
          : internalIdentity(ctx.routeParams.id);

      const updated = await bus.exec(payerService.updatePayerPreferences, {
        id,
        preferences: ctx.body,
      });

      return ok(updated);
    });

  const getPayerByTkoalyId = route
    .get('/by-tkoaly-id/:id(int)')
    .use(auth())
    .handler(async ({ bus, ...ctx }) => {
      const payer = await bus.exec(
        payerService.getPayerProfileByTkoalyIdentity,
        tkoalyIdentity(ctx.routeParams.id),
      );

      if (!payer) {
        return notFound();
      }

      return ok(payer);
    });

  const getPayerDebts = route
    .get('/:id/debts')
    .use(auth({ accessLevel: 'normal' }))
    .use(Parser.query(paginationQuery))
    .handler(async ({ bus, query, ...ctx }) => {
      let id;

      if (ctx.routeParams.id === 'me') {
        id = ctx.session.payerId;
      } else {
        id = internalIdentity(ctx.routeParams.id);
      }

      if (ctx.session.accessLevel !== 'admin' && ctx.routeParams.id !== 'me') {
        return unauthorized('Not authorized');
      }

      const includeDrafts =
        ctx.session.accessLevel === 'admin' &&
        ctx.req.query.includeDrafts === 'true';

      const debts = await bus.exec(debtService.getDebtsByPayer, {
        id,
        includeDrafts,
        includeCredited: true,
        cursor: query.cursor,
        limit: query.limit,
        sort: query.sort,
      });

      return ok(debts);
    });

  const getSessionPayer = route
    .get('/session')
    .use(auth({ accessLevel: 'normal' }))
    .handler(async ({ bus, ...ctx }) => {
      const payer = await bus.exec(
        payerService.getPayerProfileByInternalIdentity,
        ctx.session.payerId,
      );

      if (payer) {
        return ok(payer);
      }

      return notFound();
    });

  const getPayerEmails = route
    .get('/:id/emails')
    .use(
      auth({
        accessLevel: 'normal',
      }),
    )
    .handler(async ({ bus, ...ctx }) => {
      if (
        ctx.session.accessLevel !== 'admin' &&
        ctx.session.payerId.value !== ctx.routeParams.id
      ) {
        return unauthorized();
      }

      const emails = await bus.exec(
        payerService.getPayerEmails,
        internalIdentity(ctx.routeParams.id),
      );
      return ok(emails);
    });

  const updatePayerEmails = route
    .patch('/:id/emails')
    .use(auth({ accessLevel: 'normal' }))
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
    .handler(async ({ bus, ...ctx }) => {
      let id;

      if (ctx.session.accessLevel !== 'admin') {
        // Temporary restriction
        return forbidden();
      }

      if (ctx.routeParams.id === 'me') {
        id = ctx.session.payerId;
      } else {
        id = internalIdentity(ctx.routeParams.id);
      }

      if (ctx.session.accessLevel !== 'admin' && ctx.routeParams.id !== 'me') {
        return unauthorized('Not authorized');
      }

      const existing = await bus.exec(payerService.getPayerEmails, id);

      for (const { email, priority } of ctx.body) {
        const foundIndex = existing.findIndex(e => e.email === email);
        const [found] = existing.splice(foundIndex, 1);

        if (found) {
          if (priority === found.priority) {
            continue;
          }

          await bus.exec(payerService.updatePayerEmailPriority, {
            payerId: id,
            email,
            priority,
          });
        } else {
          await bus.exec(payerService.addPayerEmail, {
            payerId: id,
            email,
            priority,
            source: 'user',
          });
        }
      }

      for (const { email } of existing) {
        await bus.exec(payerService.updatePayerEmailPriority, {
          payerId: id,
          email,
          priority: 'disabled',
        });
      }

      const results = await bus.exec(payerService.getPayerEmails, id);

      return ok(results);
    });

  const sendPaymentReminder = route
    .post('/:id/send-reminder')
    .use(
      validateBody(
        t.type({
          send: t.boolean,
          ignoreCooldown: t.boolean,
        }),
      ),
    )
    .use(auth())
    .handler(async ({ bus, ...ctx }) => {
      const payer = internalIdentity(ctx.routeParams.id);
      const res = await bus.exec(debtService.sendPaymentRemindersByPayer, {
        payer,
        ...ctx.body,
      });

      return ok(res);
    });

  const mergeProfiles = route
    .post('/:id/merge')
    .use(
      validateBody(
        t.type({
          mergeWith: t.string,
        }),
      ),
    )
    .use(auth())
    .handler(async ({ bus, ...ctx }) => {
      const primary = internalIdentity(ctx.routeParams.id);
      const secondary = internalIdentity(ctx.body.mergeWith);

      const debts = await bus.exec(payerService.mergeProfiles, {
        primary,
        secondary,
      });

      return ok({
        affectedDebts: debts,
      });
    });

  const updatePayer = route
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
    .handler(async ({ bus, ...ctx }) => {
      const payer = await bus.exec(
        payerService.getPayerProfileByInternalIdentity,
        internalIdentity(ctx.routeParams.id),
      );

      if (!payer) {
        return notFound();
      }

      if (ctx.body.name) {
        await bus.exec(payerService.updatePayerName, {
          payerId: payer.id,
          name: ctx.body.name,
        });
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
            !(ctx.body.emails ?? []).some(entry => entry.email === email.email),
        );

        for (const email of added) {
          await bus.exec(payerService.addPayerEmail, {
            payerId: payer.id,
            email: email.email,
            source: 'other',
            priority: email.priority,
          });
        }

        for (const email of changed) {
          await bus.exec(payerService.updatePayerEmailPriority, {
            payerId: payer.id,
            email: email.email,
            priority: email.priority,
          });
        }

        for (const email of removed) {
          await bus.exec(payerService.updatePayerEmailPriority, {
            payerId: payer.id,
            email: email.email,
            priority: 'disabled',
          });
        }
      }

      if (ctx.body.disabled !== undefined) {
        await bus.exec(payerService.updatePayerDisabledStatus, {
          payerId: payer.id,
          disabled: ctx.body.disabled,
        });
      }

      const newPayer = await bus.exec(
        payerService.getPayerProfileByInternalIdentity,
        internalIdentity(ctx.routeParams.id),
      );

      return ok(newPayer);
    });

  return router(
    getPayerByEmail,
    getPayer,
    getPayerEmails,
    getSessionPayer,
    getPayerDebts,
    getPayerByTkoalyId,
    updatePayerPreferences,
    updatePayerEmails,
    getPayers,
    sendPaymentReminder,
    mergeProfiles,
    updatePayer,
    createPayer,
  );
};

export default factory;
