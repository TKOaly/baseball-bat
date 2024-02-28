import { router, Parser } from 'typera-express';
import {
  badRequest,
  internalServerError,
  notFound,
  ok,
  unauthorized,
} from 'typera-express/response';
import { Type } from 'io-ts';
import * as t from 'io-ts';
import {
  convertToDbDate,
  dateString,
  dbDateString,
  Debt,
  DebtPatch,
  euro,
  NewDebtTag,
  newInvoicePartial,
  tkoalyIdentity,
} from '@bbat/common/build/src/types';
import { validateBody } from '@/validate-middleware';
import { format, parseISO } from 'date-fns';
import { flow, pipe } from 'fp-ts/lib/function';
import auth from '@/auth-middleware';
import * as E from 'fp-ts/lib/Either';
import * as A from 'fp-ts/lib/Array';
import * as TE from 'fp-ts/lib/TaskEither';
import * as T from 'fp-ts/lib/Task';
import * as S from 'fp-ts/lib/string';
import * as O from 'fp-ts/lib/Option';
import * as debtService from '@/modules/debts/definitions';
import * as debtCentersService from '@/modules/debt-centers/definitions';
import * as payerService from '@/modules/payers/definitions';
import * as paymentService from '@/modules/payments/definitions';
import * as accountingService from '@/modules/accounting/definitions';
import { euroValue } from '@bbat/common/build/src/currency';
import * as EQ from 'fp-ts/lib/Eq';
import { RouterFactory } from '@/module';

const debtCenter = t.type({
  name: t.string,
  url: t.string,
  description: t.string,
});

const newOrExisting = <T>(type: Type<T>) => t.union([type, t.string]);

const payerIdentity = t.union([
  t.type({ type: t.literal('tkoaly'), value: t.number }),
  t.type({ type: t.literal('email'), value: t.string }),
  t.type({ type: t.literal('internal'), value: t.string }),
]);

const debtComponent = t.type({
  name: t.string,
  amount: t.number,
  description: t.string,
});

const createDebtPayload = t.intersection([
  t.type({
    name: t.string,
    center: t.union([debtCenter, t.string]),
    payer: payerIdentity,
    description: t.string,
    components: t.array(newOrExisting(debtComponent)),
    accountingPeriod: t.Int,
  }),
  t.partial({
    date: dbDateString,
    dueDate: t.union([t.null, dbDateString]),
    paymentCondition: t.union([t.null, t.number]),
    defaultPayment: t.type({
      type: t.literal('invoice'),
      options: newInvoicePartial,
    }),
    tags: t.array(
      t.union([
        t.string,
        t.type({
          hidden: t.boolean,
          name: t.string,
        }),
      ]),
    ),
  }),
]);

const factory: RouterFactory = route => {
  const createDebtComponent = route
    .post('/component')
    .use(auth())
    .handler(async ({ bus, ...ctx }) => {
      const component = await bus.exec(
        debtService.createDebtComponent,
        ctx.req.body,
      );
      return ok(component);
    });

  const getDebt = route
    .get('/:id')
    .use(auth({ accessLevel: 'normal' }))
    .handler(async ({ bus, ...ctx }) => {
      const debt = await bus.exec(debtService.getDebt, ctx.routeParams.id);

      if (!debt) {
        return notFound();
      }

      if (
        ctx.session.accessLevel === 'normal' &&
        debt.payerId.value !== ctx.session.payerId.value
      ) {
        return unauthorized();
      }

      return ok(debt);
    });

  const getDebts = route
    .get('/')
    .use(auth())
    .handler(async ({ bus }) => {
      const debts = await bus.exec(debtService.getDebts);
      return ok(debts);
    });

  const getDebtsByTag = route
    .get('/by-tag/:name')
    .use(auth())
    .handler(async ({ bus, ...ctx }) => {
      const debts = await bus.exec(
        debtService.getDebtsByTag,
        ctx.routeParams.name,
      );
      return ok(debts);
    });

  const getDebtsByPayment = route
    .get('/by-payment/:id')
    .use(auth({ accessLevel: 'normal' }))
    .handler(async ({ bus, ...ctx }) => {
      const payment = await bus.exec(
        paymentService.getPayment,
        ctx.routeParams.id,
      );

      if (!payment) {
        return notFound();
      }

      if (
        ctx.session.accessLevel != 'admin'
        // payment.payerId.value !== ctx.session.payerId.value
      ) {
        return unauthorized();
      }

      const debts = await bus.exec(debtService.getDebtsByPayment, payment.id);
      return ok(debts);
    });

  const publishDebts = route
    .post('/publish')
    .use(auth())
    .use(validateBody(t.type({ ids: t.array(t.string) })))
    .handler(async ({ body, bus }) => {
      await Promise.all(
        body.ids.map(async (id): Promise<void> => {
          const debt = await bus.exec(debtService.getDebt, id);

          if (!debt) {
            return Promise.reject('No such debt');
          }

          if (!debt.draft) {
            return Promise.reject('Debt already published');
          }

          const email = await bus.exec(
            payerService.getPayerPrimaryEmail,
            debt.payerId,
          );

          if (!email) {
            return Promise.reject('No email for payer found');
          }

          await bus.exec(debtService.publishDebt, id);
        }),
      );

      return ok();
    });

  const createDebt = route
    .post('/')
    .use(auth())
    .use(validateBody(createDebtPayload))
    .handler(async ({ bus, ...ctx }) => {
      const payload = ctx.body;

      const payer = await bus.exec(
        payerService.getOrCreatePayerProfileForIdentity,
        {
          id: payload.payer,
          token: ctx.req.cookies.token,
        },
      );

      if (!payer) {
        throw new Error(
          'Could not find or create a payer profile for the payer',
        );
      }

      let centerId: string;

      const accountingPeriodOpen = await bus.exec(
        accountingService.isAccountingPeriodOpen,
        ctx.body.accountingPeriod,
      );

      if (!accountingPeriodOpen) {
        return badRequest({
          message: `Accounting period ${ctx.body.accountingPeriod} is not open.`,
        });
      }

      if (typeof payload.center === 'string') {
        centerId = payload.center;
      } else {
        const center = await bus.exec(debtCentersService.createDebtCenter, {
          name: payload.center.name,
          description: payload.center.description,
          url: payload.center.url,
          accountingPeriod: payload.accountingPeriod,
        });

        if (!center) {
          throw new Error('Failed to create a new debt center');
        }

        centerId = center.id;
      }

      const componentIds = await Promise.all(
        payload.components.map(async component => {
          if (typeof component === 'string') {
            return component;
          }

          const createdComponent = await bus.exec(
            debtService.createDebtComponent,
            {
              ...component,
              amount: euro(component.amount),
              debtCenterId: centerId,
            },
          );

          return createdComponent.id;
        }),
      );

      const dueDate = payload.dueDate ?? null;
      const date = payload.date ?? null;

      if (
        (payload.paymentCondition || payload.paymentCondition === 0) &&
        payload.dueDate
      ) {
        return badRequest({
          message:
            'Payment condition and due date cannot be defined simultanously.',
        });
      }

      let tags: NewDebtTag[] = [];

      if (payload.tags) {
        tags = payload.tags.map(tag => {
          if (typeof tag === 'string') {
            return { name: tag, hidden: false };
          } else {
            return tag;
          }
        });
      }

      const debt = await bus.exec(debtService.createDebt, {
        debt: {
          name: payload.name,
          description: payload.description,
          components: componentIds,
          centerId,
          payer: payer.id,
          paymentCondition: payload.paymentCondition ?? null,
          accountingPeriod: ctx.body.accountingPeriod,
          dueDate,
          date,
          tags,
        },
        options: {
          defaultPayment: ctx.body.defaultPayment?.options,
        },
      });

      return ok(debt);
    });

  const updateMultipleDebts = route
    .post('/update-multiple')
    .use(
      validateBody(
        t.type({
          debts: t.array(t.string),
          values: t.partial({
            name: t.string,
            description: t.string,
            payerId: payerIdentity,
            centerId: t.string,
            dueDate: t.union([t.null, t.string]),
            date: dbDateString,
            paymentCondition: t.union([t.null, t.number]),
            components: t.array(
              t.type({
                operation: t.union([
                  t.literal('include'),
                  t.literal('exclude'),
                ]),
                id: t.string,
              }),
            ),
            tags: t.array(
              t.type({
                operation: t.union([
                  t.literal('include'),
                  t.literal('exclude'),
                ]),
                name: t.string,
              }),
            ),
          }),
        }),
      ),
    )
    .use(auth())
    .handler(async ({ bus, ...ctx }) => {
      const { dueDate, paymentCondition } = ctx.body.values;

      if (
        dueDate !== undefined &&
        dueDate !== null &&
        paymentCondition !== undefined &&
        paymentCondition !== null
      ) {
        return badRequest({
          message:
            'Cannot define both due date and payment condition at the same time.',
        });
      }

      const values: Partial<Omit<DebtPatch, 'id'>> = {
        name: ctx.body.values.name,
        description: ctx.body.values.description,
        centerId: ctx.body.values.centerId,
        payerId: ctx.body.values.payerId,
        date: ctx.body.values.date,
      };

      if (dueDate) {
        values.dueDate = parseISO(dueDate);
        values.paymentCondition = null;
      } else {
        values.paymentCondition = paymentCondition;
        values.dueDate = null;
      }

      const update = (id: string) => async () => {
        const debt = await bus.exec(debtService.getDebt, id);

        if (!debt) {
          throw new Error(`Debt with ID '${id}' does not exist`);
        }

        let components = undefined;

        if (ctx.body.values.components) {
          const componentIds = new Set(debt.debtComponents.map(c => c.id));

          for (const { operation, id } of ctx.body.values.components) {
            if (operation === 'include') {
              componentIds.add(id);
            } else {
              componentIds.delete(id);
            }
          }

          components = [...componentIds];
        }

        let tags = undefined;

        if (ctx.body.values.tags) {
          const tagNames = new Set(debt.tags.map(t => t.name));

          for (const { operation, name } of ctx.body.values.tags) {
            if (operation === 'include') {
              tagNames.add(name);
            } else {
              tagNames.delete(name);
            }
          }

          tags = [...tagNames];
        }

        console.log(tags);

        return await bus.exec(debtService.updateDebt, {
          ...values,
          id,
          components,
          tags,
        });
      };

      return pipe(
        ctx.body.debts,
        A.traverse(TE.ApplicativePar)(update),
        T.map(
          E.matchW(
            () => badRequest(),
            debts => ok(debts),
          ),
        ),
      )();
    });

  const updateDebt = route
    .patch('/:id')
    .use(
      validateBody(
        t.partial({
          name: t.string,
          description: t.string,
          payerId: payerIdentity,
          date: t.union([t.null, dateString]),
          centerId: t.string,
          dueDate: t.union([t.null, t.string]),
          paymentCondition: t.union([t.null, t.number]),
          components: t.array(t.string),
        }),
      ),
    )
    .use(auth())
    .handler(async ({ bus, ...ctx }) => {
      if (ctx.body.paymentCondition && ctx.body.dueDate) {
        return badRequest({
          message:
            'Payment condition and due date cannot be defined simultanously.',
        });
      }

      let dueDate = undefined;
      let date = undefined;
      let paymentCondition = undefined;

      if (ctx.body.dueDate) {
        dueDate = parseISO(ctx.body.dueDate);
      } else if (ctx.body.paymentCondition) {
        paymentCondition = ctx.body.paymentCondition;
      }

      if (ctx.body.date === null) {
        date = null;
      } else if (ctx.body.date !== undefined) {
        date = convertToDbDate(ctx.body.date);

        if (!date) {
          return badRequest({
            message: 'Invalid date.',
          });
        }
      }

      const updated = await bus.exec(debtService.updateDebt, {
        id: ctx.routeParams.id,
        name: ctx.body.name,
        description: ctx.body.description,
        centerId: ctx.body.centerId,
        dueDate,
        date,
        paymentCondition,
        payerId: ctx.body.payerId,
        components: ctx.body.components ?? [],
      });

      return pipe(
        updated,
        E.foldW(
          () => badRequest(),
          debt => ok(debt),
        ),
      );
    });

  const getPaymentsContainingDebt = route
    .get('/:id/payments')
    .use(auth({ accessLevel: 'normal' }))
    .handler(async ({ bus, ...ctx }) => {
      const debt = await bus.exec(debtService.getDebt, ctx.routeParams.id);

      if (!debt) {
        return notFound();
      }

      if (
        ctx.session.accessLevel === 'normal' &&
        debt.payerId.value !== ctx.session.payerId.value
      ) {
        return unauthorized();
      }

      const payments = await bus.exec(
        paymentService.getPaymentsContainingDebt,
        ctx.routeParams.id,
      );

      return ok(payments);
    });

  const massCreateDebts = route
    .post('/mass-create')
    .use(auth())
    .use(
      validateBody(
        t.type({
          defaults: t.partial({
            tkoalyUserId: t.number,
            debtCenter: t.string,
            title: t.string,
            description: t.string,
            email: t.string,
            amount: euroValue,
            dueDate: dateString,
            components: t.array(t.string),
            tags: t.array(t.string),
            accountingPeriod: t.Int,
            //paymentNumber: t.string,
            //referenceNumber: t.string,
          }),
          debts: t.array(
            t.partial({
              tkoalyUserId: t.number,
              debtCenter: t.string,
              title: t.string,
              description: t.string,
              email: t.string,
              date: dateString,
              amount: euroValue,
              dueDate: dateString,
              publishedAt: dateString,
              paymentCondition: t.Int,
              components: t.array(t.string),
              paymentNumber: t.string,
              referenceNumber: t.string,
              tags: t.array(t.string),
              accountingPeriod: t.Int,
            }),
          ),
          components: t.array(
            t.type({
              name: t.string,
              amount: euroValue,
            }),
          ),
          dryRun: t.boolean,
        }),
      ),
    )
    .handler(async ({ bus, ...ctx }) => {
      const { debts, defaults, dryRun, components } = ctx.body;

      defaults.tags = [
        `mass-import-${format(new Date(), 'ddMMyyyy-HHmmss')}`,
        ...(defaults.tags ?? []),
      ];

      const res = await bus.exec(debtService.batchCreateDebts, {
        debts: debts.map(debt => ({
          ...defaults,
          ...debt,
          tkoalyUserId: pipe(
            defaults.tkoalyUserId ?? debt.tkoalyUserId,
            O.fromNullable,
            O.map(tkoalyIdentity),
            O.getOrElseW(() => undefined),
          ),
        })),
        components,
        token: ctx.req.cookies.token,
        dryRun,
      });

      return ok({
        progress: res,
      });
    });

  const massCreateDebtsProgressPoll = route
    .get('/mass-create/poll/:id')
    .use(auth())
    .handler(async ctx => {
      const flow = await ctx.jobs.getFlowProducer().getFlow({
        id: ctx.routeParams.id,
        queueName: 'debts',
        prefix: 'bbat-jobs',
      });

      if (!flow?.children) {
        return internalServerError();
      }

      const total = await flow.job.getDependenciesCount();

      if (!total) {
        return internalServerError();
      }

      const result =
        flow.job.returnvalue?.result === 'success'
          ? flow.job.returnvalue?.data?.debts
          : undefined;

      return ok({
        current: total.processed ?? 0,
        total: (total.unprocessed ?? 0) + (total.processed ?? 0),
        result,
        return: flow.job.returnvalue,
      });
    });

  const deleteDebt = route
    .delete('/:id')
    .use(auth())
    .handler(async ({ bus, ...ctx }) => {
      await bus.exec(debtService.deleteDebt, ctx.routeParams.id);

      return ok();
    });

  const creditDebt = route
    .post('/:id/credit')
    .use(auth())
    .handler(async ({ bus, ...ctx }) => {
      await bus.exec(debtService.creditDebt, ctx.routeParams.id);

      return ok();
    });

  const markPaidWithCash = route
    .post('/:id/mark-paid-with-cash')
    .use(auth())
    .handler(async ({ bus, ...ctx }) => {
      const debt = await bus.exec(debtService.getDebt, ctx.routeParams.id);

      if (!debt) {
        return notFound('Debt not found');
      }

      if (debt.draft) {
        return badRequest('Cannot mark draft debts as paid');
      }

      if (debt.credited) {
        return badRequest('Cannot mark credited debts as paid');
      }

      if (debt.status === 'paid') {
        return badRequest('Debt already paid');
      }

      const amount = debt.total;

      const payment = await bus.exec(debtService.createPayment, {
        debts: [debt.id],
        payment: {
          type: 'cash',
          title: 'Cash Payment',
          message: `Cash payment of debt "${debt.name}"`,
        },
      });

      await bus.exec(paymentService.createPaymentEvent, {
        paymentId: payment.id,
        type: 'payment',
        amount,
        transaction: null,
      });

      return ok(payment);
    });

  const sendAllReminders = route
    .post('/send-reminders')
    .use(
      validateBody(
        t.type({
          debts: t.union([t.null, t.array(t.string)]),
          send: t.boolean,
          ignoreCooldown: t.boolean,
        }),
      ),
    )
    .use(auth())
    .handler(async ({ bus, ...ctx }) => {
      const getEmailPayerId = (debt: Debt) => debt.payerId.value;
      const EmailPayerEq = EQ.contramap(getEmailPayerId)(S.Eq);
      // let debts = ctx.body.debts;

      const fetchDebts = flow(
        ({ right }: { left: string[]; right: { debtId: string }[] }) => right,
        A.map(({ debtId }) => debtId),
        A.traverse(T.ApplicativePar)(bus.execT(debtService.getDebt)),
        T.map(A.map(O.fromNullable)),
        T.map(A.filter(O.isSome)),
        T.map(A.map(s => s.value)),
      );

      return pipe(
        bus.execT(debtService.sendAllReminders)({
          draft: !ctx.body.send,
          ignoreReminderCooldown: ctx.body.ignoreCooldown,
          debts: ctx.body.debts ?? undefined,
        }),
        T.bind('debts', fetchDebts),
        T.map(({ left, debts }) =>
          ok({
            messageCount: debts.length,
            payerCount: A.uniq(EmailPayerEq)(debts).length,
            errors: left,
          }),
        ),
      )();
    });

  const sendReminder = route
    .post('/:id/send-reminder')
    .use(
      Parser.query(
        t.partial({
          draft: t.union([t.literal('yes'), t.literal('no')]),
        }),
      ),
    )
    .use(auth())
    .handler(async ({ bus, ...ctx }) => {
      const result = await bus.exec(debtService.sendReminder, {
        debtId: ctx.routeParams.id,
        draft: ctx.query.draft === 'yes',
      });

      if (E.isRight(result)) {
        return ok(result.right);
      } else {
        return internalServerError(result.left);
      }
    });

  const getDebtsByEmail = route
    .get('/by-email/:email')
    .use(auth())
    .handler(async ({ bus, ...ctx }) => {
      const debts = await bus.exec(
        debtService.getDebtsByEmail,
        ctx.routeParams.email,
      );

      return ok(debts);
    });

  return router(
    sendAllReminders,
    createDebtComponent,
    createDebt,
    getDebtsByPayment,
    getDebt,
    getDebts,
    publishDebts,
    getPaymentsContainingDebt,
    massCreateDebts,
    massCreateDebtsProgressPoll,
    deleteDebt,
    creditDebt,
    markPaidWithCash,
    sendReminder,
    updateDebt,
    updateMultipleDebts,
    getDebtsByEmail,
    getDebtsByTag,
  );
};

export default factory;
