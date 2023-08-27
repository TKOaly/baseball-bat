import { Router, route, router, Parser } from 'typera-express';
import { AuthService } from '../auth-middleware';
import { CreateDebtOptions, DebtService } from '../services/debt';
import { badRequest, internalServerError, notFound, ok, unauthorized } from 'typera-express/response';
import { validate, v4 as uuidv4 } from 'uuid';
import { Inject, Service } from 'typedi';
import { Config } from '../config';
import { DebtCentersService } from '../services/debt_centers';
import { Type } from 'io-ts';
import * as t from 'io-ts';
import { convertToDbDate, dateString, dbDateString, Debt, DebtComponent, DebtPatch, Email, emailIdentity, euro, internalIdentity, isPaymentInvoice, NewDebt, NewDebtTag, PayerProfile, Payment, tkoalyIdentity } from '../../common/types';
import { PayerService } from '../services/payer';
import { validateBody } from '../validate-middleware';
import { PaymentService } from '../services/payements';
import { EmailService } from '../services/email';
import { format, isBefore, parse, parseISO, subDays } from 'date-fns';
import { pipe } from 'fp-ts/lib/function';
import * as E from 'fp-ts/lib/Either';
import * as A from 'fp-ts/lib/Array';
import * as TE from 'fp-ts/lib/TaskEither';
import * as T from 'fp-ts/lib/Task';
import * as S from 'fp-ts/lib/string';
import { euroValue } from '../../common/currency';
import { UsersService } from '../services/users';
import * as EQ from 'fp-ts/lib/Eq';
import { RedisClientType } from 'redis';
import { AccountingService } from '../services/accounting';
import { JobService } from '../services/jobs';

const debtCenter = t.type({
  name: t.string,
  url: t.string,
  description: t.string,
});

const newOrExisting = <T>(type: Type<T>) => t.union([
  type,
  t.string,
]);

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
    dueDate: dbDateString,
    paymentCondition: t.union([t.null, t.number]),
    tags: t.array(t.union([
      t.string,
      t.type({
        hidden: t.boolean,
        name: t.string,
      }),
    ])),
  }),
]);

@Service()
export class DebtApi {
  @Inject(() => Config)
  config: Config;

  @Inject('redis')
  redis: RedisClientType;

  @Inject(() => DebtService)
  debtService: DebtService;

  @Inject(() => PayerService)
  payerService: PayerService;

  @Inject(() => UsersService)
  usersService: UsersService;

  @Inject(() => JobService)
  jobService: JobService;

  @Inject(() => PaymentService)
  paymentService: PaymentService;

  @Inject(() => AuthService)
  authService: AuthService;

  @Inject(() => DebtCentersService)
  debtCentersService: DebtCentersService;

  @Inject(() => EmailService)
  emailService: EmailService;

  @Inject(() => AccountingService)
  accountingService: AccountingService;

  private createDebtComponent() {
    return route
      .post('/component')
      .use(this.authService.createAuthMiddleware())
      .handler(async (ctx) => {
        const component = await this.debtService.createDebtComponent(ctx.req.body);
        return ok(component);
      });
  }

  private getDebt() {
    return route
      .get('/:id')
      .use(this.authService.createAuthMiddleware({ accessLevel: 'normal' }))
      .handler(async (ctx) => {
        const debt = await this.debtService.getDebt(ctx.routeParams.id);

        if (!debt) {
          return notFound();
        }

        if (ctx.session.accessLevel === 'normal' && debt.payerId.value !== ctx.session.payerId) {
          return unauthorized();
        }

        return ok(debt);
      });
  }

  private getDebts() {
    return route
      .get('/')
      .use(this.authService.createAuthMiddleware())
      .handler(async () => {
        const debts = await this.debtService.getDebts();
        return ok(debts);
      });
  }

  private getDebtsByTag() {
    return route
      .get('/by-tag/:name')
      .use(this.authService.createAuthMiddleware())
      .handler(async (ctx) => {
        const debts = await this.debtService.getDebtsByTag(ctx.routeParams.name);
        return ok(debts);
      });
  }

  private getDebtsByPayment() {
    return route
      .get('/by-payment/:id')
      .use(this.authService.createAuthMiddleware({ accessLevel: 'normal' }))
      .handler(async (ctx) => {
        const payment = await this.paymentService.getPayment(ctx.routeParams.id);

        if (!payment) {
          return notFound();
        }

        if (ctx.session.accessLevel != 'admin' && payment.payerId.value !== ctx.session.payerId) {
          return unauthorized();
        }

        const debts = await this.debtService.getDebtsByPayment(payment.id);
        return ok(debts);
      });
  }

  private publishDebts() {
    return route
      .post('/publish')
      .use(this.authService.createAuthMiddleware())
      .use(validateBody(t.type({ ids: t.array(t.string) })))
      .handler(async ({ body }) => {
        await Promise.all(body.ids.map(async (id): Promise<void> => {
          const debt = await this.debtService.getDebt(id);

          if (!debt) {
            return Promise.reject('No such debt');
          }

          if (!debt.draft) {
            return Promise.reject('Debt already published');
          }

          const email = await this.payerService.getPayerPrimaryEmail(debt.payerId);

          if (!email) {
            return Promise.reject('No email for payer found');
          }

          await this.debtService.publishDebt(id);
        }));

        return ok();
      });
  }

  private createDebt() {
    return route
      .post('/')
      .use(this.authService.createAuthMiddleware())
      .use(validateBody(createDebtPayload))
      .handler(async (ctx) => {
        const payload = ctx.body;

        const payer = await this.payerService.getOrCreatePayerProfileForIdentity(payload.payer, ctx.req.cookies.token);

        if (!payer) {
          throw new Error('Could not find or create a payer profile for the payer');
        }

        let centerId: string;

        const accountingPeriodOpen = await this.accountingService.isAccountingPeriodOpen(ctx.body.accountingPeriod);

        if (!accountingPeriodOpen) {
          return badRequest({
            message: `Accounting period ${ctx.body.accountingPeriod} is not open.`,
          })
        }

        if (typeof payload.center === 'string') {
          centerId = payload.center;
        } else {
          const center = await this.debtCentersService.createDebtCenter({
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
          payload.components
            .map(async (component) => {
              if (typeof component === 'string') {
                return component;
              }

              const createdComponent = await this.debtService.createDebtComponent({
                ...component,
                amount: euro(component.amount),
                debtCenterId: centerId,
              });

              return createdComponent.id;
            }),
        );

        let dueDate = payload.dueDate ?? null;
        let date = payload.date ?? null;

        if ((payload.paymentCondition || payload.paymentCondition === 0) && payload.dueDate) {
          return badRequest({
            message: 'Payment condition and due date cannot be defined simultanously.',
          });
        }

        let tags: NewDebtTag[] = [];

        if (payload.tags) {
          tags = payload.tags.map((tag) => {
            if (typeof tag === 'string') {
              return { name: tag, hidden: false };
            } else {
              return tag;
            }
          });
        }

        const debt = await this.debtService.createDebt({
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
        });

        return ok(debt);
      });
  }

  private updateMultipleDebts() {
    return route
      .post('/update-multiple')
      .use(validateBody(t.type({
        debts: t.array(t.string),
        values: t.partial({
          name: t.string,
          description: t.string,
          payerId: payerIdentity,
          centerId: t.string,
          dueDate: t.union([t.null, t.string]),
          date: dbDateString,
          paymentCondition: t.union([t.null, t.number]),
          components: t.array(t.type({
            operation: t.union([ t.literal('include'), t.literal('exclude') ]),
            id: t.string,
          })),
          tags: t.array(t.type({
            operation: t.union([ t.literal('include'), t.literal('exclude') ]),
            name: t.string,
          })),
        }),
      })))
      .use(this.authService.createAuthMiddleware())
      .handler(async (ctx) => {
        const { dueDate, paymentCondition } = ctx.body.values;

        if (dueDate !== undefined && dueDate !== null && paymentCondition !== undefined && paymentCondition !== null) {
          return badRequest({
            message: 'Cannot define both due date and payment condition at the same time.',
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
          const debt = await this.debtService.getDebt(id);

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

          return await this.debtService.updateDebt({
            ...values,
            id,
            components,
            tags,
          });
        };

        return pipe(
          ctx.body.debts,
          A.traverse(TE.ApplicativePar)(update),
          T.map(E.matchW(
            () => badRequest(),
            (debts) => ok(debts),
          )),
        )();
      });
  }

  private updateDebt() {
    return route
      .patch('/:id')
      .use(validateBody(t.partial({
        name: t.string,
        description: t.string,
        payerId: payerIdentity,
        date: t.union([t.null, dateString]),
        centerId: t.string,
        dueDate: t.union([t.null, t.string]),
        paymentCondition: t.union([t.null, t.number]),
        components: t.array(t.string),
      })))
      .use(this.authService.createAuthMiddleware())
      .handler(async (ctx) => {
        if (ctx.body.paymentCondition && ctx.body.dueDate) {
          return badRequest({
            "message": "Payment condition and due date cannot be defined simultanously.",
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
              message: "Invalid date.",
            });
          }
        }

        const updated = await this.debtService.updateDebt({
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
            (debt) => ok(debt),
          ),
        );
      });
  }

  private getPaymentsContainingDebt() {
    return route
      .get('/:id/payments')
      .use(this.authService.createAuthMiddleware({ accessLevel: 'normal' }))
      .handler(async (ctx) => {
        const debt = await this.debtService.getDebt(ctx.routeParams.id);

        if (!debt) {
          return notFound();
        }

        if (ctx.session.accessLevel === 'normal' && debt.payerId.value !== ctx.session.payerId) {
          return unauthorized();
        }

        const payments = await this.paymentService.getPaymentsContainingDebt(ctx.routeParams.id);

        return ok(payments);
      });
  }

  private massCreateDebts() {
    const resolvePayer = async (
      { email, name, tkoalyUserId }: { email?: string, name?: string, tkoalyUserId?: number },
      token: string,
      dryRun: boolean,
    ): Promise<PayerProfile | null> => {
      if (tkoalyUserId) {
        const payer = await this.payerService.getPayerProfileByTkoalyIdentity(tkoalyIdentity(tkoalyUserId));

        if (payer) {
          return payer;
        }
      }

      if (email) {
        const payer = await this.payerService.getPayerProfileByEmailIdentity(emailIdentity(email));

        if (payer) {
          return payer;
        }

        const user = await this.usersService.getUpstreamUserByEmail(email, token);

        if (user) {
          if (dryRun) {
            return {
              id: internalIdentity(''),
              email: user.email,
              emails: [],
              name: user.screenName,
              tkoalyUserId: tkoalyIdentity(user.id),
              createdAt: new Date(),
              updatedAt: new Date(),
              stripeCustomerId: '',
              disabled: false,
            };
          } else {
            return await this.payerService.createPayerProfileFromTkoalyIdentity(tkoalyIdentity(user.id), token);
          }
        }

        if (name) {
          if (dryRun) {
            return {
              id: internalIdentity(''),
              email,
              name,
              createdAt: new Date(),
              updatedAt: new Date(),
              emails: [],
              stripeCustomerId: '',
              disabled: false,
            };
          } else {
            const payer = await this.payerService.createPayerProfileFromEmailIdentity(emailIdentity(email), { name });
            return payer;
          }
        }
      }

      return null;
    };

    const resolveDebtCenter = async (debtCenter: string, dryRun: boolean, accountingPeriod: number) => {
      if (validate(debtCenter)) {
        const byId = await this.debtCentersService.getDebtCenter(debtCenter);
        return byId;
      }

      const byName = await this.debtCentersService.getDebtCenterByName(debtCenter);

      if (byName) {
        return byName;
      }

      if (dryRun) {
        return {
          id: '',
          name: debtCenter,
          accountingPeriod,
          description: '',
          url: '',
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      } else {
        return await this.debtCentersService.createDebtCenter({
          name: debtCenter,
          accountingPeriod,
          description: '',
          url: '',
        });
      }
    };

    return route
      .post('/mass-create')
      .use(this.authService.createAuthMiddleware())
      .use(validateBody(t.type({
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
        debts: t.array(t.partial({
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
        })),
        components: t.array(t.type({
          name: t.string,
          amount: euroValue,
        })),
        dryRun: t.boolean,
      })))
      .handler(async (ctx) => {
        let { debts, defaults, dryRun, components } = ctx.body;

        defaults.tags = [
          `mass-import-${format(new Date(), 'ddMMyyyy-HHmmss')}`,
          ...(defaults.tags ?? []),
        ];

        const res = await this.debtService.batchCreateDebts(
          debts.map((debt) => ({ ...defaults, ...debt })),
          components,
          ctx.req.cookies.token,
          dryRun,
        );

        return ok({
          progress: res.job.id,
        });
      });
  }

  private massCreateDebtsProgressPoll() {
    return route
      .get('/mass-create/poll/:id')
      .use(this.authService.createAuthMiddleware())
      .handler(async (ctx) => {
        const flow = await this.jobService
          .getFlowProducer()
          .getFlow({
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

        const states = await Promise.all(flow.children.map((child) => child.job.getState()));

        const result = flow.job.returnvalue?.result === 'success'
          ? flow.job.returnvalue?.data?.debts
          : undefined;

        return ok({
          current: total.processed ?? 0,
          total: (total.unprocessed ?? 0) + (total.processed ?? 0),
          result,
          return: flow.job.returnvalue,
        });
      });
  }

  private deleteDebt() {
    return route
      .delete('/:id')
      .use(this.authService.createAuthMiddleware())
      .handler(async (ctx) => {
        await this.debtService.deleteDebt(ctx.routeParams.id);

        return ok();
      });
  }

  private creditDebt() {
    return route
      .post('/:id/credit')
      .use(this.authService.createAuthMiddleware())
      .handler(async (ctx) => {
        await this.debtService.creditDebt(ctx.routeParams.id);

        return ok();
      });
  }

  private markPaidWithCash() {
    return route
      .post('/:id/mark-paid-with-cash')
      .use(this.authService.createAuthMiddleware())
      .handler(async (ctx) => {
        const debt = await this.debtService.getDebt(ctx.routeParams.id);

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

        const payment = await this.paymentService.createPayment({
          type: 'cash',
          title: 'Cash Payment',
          message: `Cash payment of debt "${debt.name}"`,
          debts: [debt.id],
          data: {},
        });
        
        const amount = await this.debtService.getDebtTotal(debt.id);

        await this.paymentService.createPaymentEvent(payment.id, {
          type: 'payment',
          amount,
        });

        return ok(payment);
      });
  }

  private sendAllReminders() {
    return route
      .post('/send-reminders')
      .use(validateBody(t.type({
        debts: t.union([t.null, t.array(t.string)]),
        send: t.boolean,
        ignoreCooldown: t.boolean,
      })))
      .use(this.authService.createAuthMiddleware())
      .handler(async (ctx) => {
        const getEmailPayerId = ([, debt]: [Email, Debt]) => debt.payerId.value;
        const EmailPayerEq = EQ.contramap(getEmailPayerId)(S.Eq);
        let debts: null | Debt[] = null;

        if (ctx.body.debts !== null) {
          let results = await Promise.all(ctx.body.debts.map(async (d) => this.debtService.getDebt(d)));

          if (results.some((d) => d === null)) {
            return notFound({
              message: 'Debt not found.',
            });
          }

          debts = results as Debt[];
        }

        return pipe(
          () => this.debtService.sendAllReminders(!ctx.body.send, ctx.body.ignoreCooldown, debts),
          T.map(({ left, right }) => ok({
            messageCount: right.length,
            payerCount: A.uniq(EmailPayerEq)(right).length,
            errors: left,
          })),
        )();
      });
  }

  private sendReminder() {
    return route
      .post('/:id/send-reminder')
      .use(Parser.query(t.partial({
        draft: t.union([
          t.literal('yes'),
          t.literal('no'),
        ]),
      })))
      .use(this.authService.createAuthMiddleware())
      .handler(async (ctx) => {
        const debt = await this.debtService.getDebt(ctx.routeParams.id);

        if (!debt) {
          return notFound('Debt not found');
        }

        const result = await this.debtService.sendReminder(debt, ctx.query.draft === 'yes');

        if (E.isRight(result)) {
          return ok(result.right);
        } else {
          return internalServerError(result.left);
        }
      });
  }

  private getDebtsByEmail() {
    return route
      .get('/by-email/:email')
      .use(this.authService.createAuthMiddleware())
      .handler(async (ctx) => {
        const debts = await this.debtService.getDebtsByEmail(ctx.routeParams.email);

        return ok(debts);
      });
  }

  public router(): Router {
    return router(
      this.sendAllReminders(),
      this.createDebtComponent(),
      this.createDebt(),
      this.getDebtsByPayment(),
      this.getDebt(),
      this.getDebts(),
      this.publishDebts(),
      this.getPaymentsContainingDebt(),
      this.massCreateDebts(),
      this.massCreateDebtsProgressPoll(),
      this.deleteDebt(),
      this.creditDebt(),
      this.markPaidWithCash(),
      this.sendReminder(),
      this.updateDebt(),
      this.updateMultipleDebts(),
      this.getDebtsByEmail(),
      this.getDebtsByTag(),
    );
  }
}
