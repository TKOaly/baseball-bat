import { route, router } from 'typera-express';
import { ok, badRequest, notFound } from 'typera-express/response';
import { DebtCentersService } from '../services/debt_centers';
import { DebtService } from '../services/debt';
import { AuthService } from '../auth-middleware';
import { Inject, Service } from 'typedi';
import { Config } from '../config';
import { EventsService } from '../services/events';
import { euro, emailIdentity, dateString, convertToDbDate, Registration } from '../../common/types';
import * as t from 'io-ts';
import * as E from 'fp-ts/lib/Either';
import { validateBody } from '../validate-middleware';
import { PayerService } from '../services/payer';
import { PaymentService } from '../services/payements';
import { pipe } from 'fp-ts/lib/function';
import { euroValue } from '../../common/currency';

const componentRule = t.type({
  type: t.literal('CUSTOM_FIELD'),
  eventId: t.number,
  customFieldId: t.number,
  value: t.string,
});

type ComponentRule = t.TypeOf<typeof componentRule>;

const createDebtCenterFromEventBody = t.type({
  events: t.array(t.number),
  registrations: t.array(t.number),
  settings: t.type({
    name: t.string,
    description: t.string,
    basePrice: euroValue,
    dueDate: dateString,
    components: t.array(t.type({
      name: t.string,
      amount: euroValue,
      rules: t.array(componentRule),
    })),
  }),
});

@Service()
export class DebtCentersApi {
  @Inject(() => Config)
    config: Config;

  @Inject(() => DebtCentersService)
    debtCentersService: DebtCentersService;

  @Inject(() => AuthService)
    authService: AuthService;

  @Inject(() => DebtService)
    debtService: DebtService;

  @Inject(() => EventsService)
    eventsService: EventsService;

  @Inject(() => PaymentService)
    paymentService: PaymentService;

  @Inject(() => PayerService)
    payerService: PayerService;

  getDebtCenters() {
    return route
      .get('/')
      .use(this.authService.createAuthMiddleware())
      .handler(async () => {
        const centers = await this.debtCentersService.getDebtCenters();
        return ok(centers);
      });
  }

  getDebtCenter() {
    return route
      .get('/:id')
      .use(this.authService.createAuthMiddleware())
      .handler(async (ctx) => {
        const center = await this.debtCentersService.getDebtCenter(ctx.routeParams.id);

        if (center) {
          return ok(center);
        } else {
          return notFound();
        }
      });
  }

  getDebtsByCenter() {
    return route
      .get('/:id/debts')
      .use(this.authService.createAuthMiddleware())
      .handler(async (ctx) => {
        const debts = await this.debtService.getDebtsByCenter(ctx.routeParams.id);
        return ok(debts);
      });
  }

  getDebtComponentsByCenter() {
    return route
      .get('/:id/components')
      .use(this.authService.createAuthMiddleware())
      .handler(async (ctx) => {
        const components = await this.debtService.getDebtComponentsByCenter(ctx.routeParams.id);
        return ok(components);
      });
  }

  createDebtCenter() {
    return route
      .post('/')
      .use(this.authService.createAuthMiddleware())
      .handler(async (ctx) => {
        try {
          const center = await this.debtCentersService.createDebtCenter(ctx.req.body);
          return ok(center);
        } catch (err) {
          console.log(err);

          if ((err as any).constraint === 'name_unique') {
            return badRequest({
              type: 'unique_violation',
              field: 'name',
              message: `Debt center with name "${ctx.req.body.name}" already exists`,
              data: {
                value: ctx.req.body.name,
              },
            });
          }

          throw err;
        }
      });
  }

  deleteDebtCenter() {
    return route
      .delete('/:id')
      .use(this.authService.createAuthMiddleware())
      .handler(async (ctx) => {
        const debts = await this.debtService.getDebtsByCenter(ctx.routeParams.id);

        if (debts.length > 0) {
          return badRequest({
            error: 'contains_debts',
          });
        }

        const deleted = await this.debtCentersService.deleteDebtCenter(ctx.routeParams.id);

        if (deleted === null) {
          return notFound({
            error: 'not_found',
          });
        }

        return ok();
      });
  }

  updateDebtCenter() {
    return route
      .put('/:id')
      .use(this.authService.createAuthMiddleware())
      .use(validateBody(t.type({
        name: t.string,
        description: t.string,
        url: t.string,
      })))
      .handler(async (ctx) => {
        await this.debtCentersService.updateDebtCenter({
          id: ctx.routeParams.id,
          ...ctx.body,
        });

        const updated = await this.debtCentersService.getDebtCenter(ctx.routeParams.id);

        return ok(updated);
      });
  }

  private async evaluateRule(rule: ComponentRule, eventId: number, registration: Registration): Promise<boolean> {
    if (rule.type === 'CUSTOM_FIELD') {
      if (rule.eventId !== eventId) {
        return false;
      }

      const answer = registration.answers.find(answer => answer.question_id === rule.customFieldId);

      if (!answer) {
        return false;
      }

      return answer.answer === rule.value;
    }

    return false;
  }


  createDebtCenterFromEvent() {
    return route
      .post('/fromEvent')
      .use(this.authService.createAuthMiddleware())
      .use(validateBody(createDebtCenterFromEventBody))
      .handler(async (ctx) => {
        const body = ctx.body;

        const registrations = await Promise.all(
          body.events.map((id) => {
            return this.eventsService.getEventRegistrations(id);
          }),
        );

        const registrationsFlat = registrations.flat();

        for (const id of body.registrations) {
          const index = registrationsFlat.findIndex(r => r.id === id);

          if (index === -1) {
            return badRequest({
              message: `Registration ${id} does not belong to any of the specified events`,
            });
          }
        }

        const center = await this.debtCentersService.createDebtCenter({
          name: body.settings.name,
          description: body.settings.description,
          url: '',
        });

        if (!center) {
          throw new Error('Unable to create new debt center');
        }

        let baseComponentId: string | null = null;

        if (body.settings.basePrice) {
          const baseComponent = await this.debtService.createDebtComponent({
            name: 'Base price',
            amount: body.settings.basePrice,
            description: 'Base price for the event',
            debtCenterId: center.id,
          });

          baseComponentId = baseComponent.id;
        }

        const components = await Promise.all(
          body.settings.components.map((mapping) => {
            return this.debtService.createDebtComponent({
              name: mapping.name,
              amount: mapping.amount,
              description: 'Autogenerated from event registration fields',
              debtCenterId: center.id,
            });
          }),
        );

        await Promise.all(
          registrations.flatMap((registrations, i) => registrations
            .filter((reg) => body.registrations.indexOf(reg.id) > -1)
            .map(async (registration) => {
              const eventId = body.events[i];

              const componentIdPromises = body.settings.components
                .map(async (mapping, i) => {
                  for (const rule of mapping.rules) {
                    const result = await this.evaluateRule(rule, eventId, registration);

                    if (result) {
                      return [components[i].id];
                    }
                  }

                  return [];
                });

              const componentIds = (await Promise.all(componentIdPromises)).flat();

              const payerIdentity = registration.userId
                ? registration.userId
                : emailIdentity(registration.email);

              const payer = await this.payerService.createPayerProfileForExternalIdentity(payerIdentity, ctx.req.cookies.token, registration.name);

              if (!payer) {
                throw new Error('Unable to create payer profile for the debt');
              }

              const dueDate = convertToDbDate(body.settings.dueDate);

              if (!dueDate) {
                throw new Error('Date conversion error');
              }

              const debt = await this.debtService.createDebt({
                name: body.settings.name,
                description: body.settings.description,
                centerId: center.id,
                components: baseComponentId
                  ? [baseComponentId, ...componentIds]
                  : componentIds,
                payer: payer.id,
                dueDate,
                paymentCondition: null,
                tags: [{ name: `from-event`, hidden: true }],
              });

              return debt;
            })),
          );

          return ok(center);
        });
  }

  private deleteDebtComponent() {
    return route
      .delete('/:debtCenterId/components/:debtComponentId')
      .use(this.authService.createAuthMiddleware())
      .handler(async (ctx) => {
        const { debtCenterId, debtComponentId } = ctx.routeParams;

        return pipe(
          await this.debtService.deleteDebtComponent(debtCenterId, debtComponentId),
          E.matchW(
            () => notFound(),
            ({ affectedDebts }) => ok({ affectedDebts }),
          ),
        );
      });
  }

  private updateDebtComponent() {
    return route
      .patch('/:debtCenterId/components/:debtComponentId')
      .use(this.authService.createAuthMiddleware())
      .use(validateBody(t.partial({
        name: t.string,
        amount: euroValue,
      })))
      .handler(async (ctx) => {
        const { debtCenterId, debtComponentId } = ctx.routeParams;

        const component = await this.debtService.updateDebtComponent(debtCenterId, debtComponentId, ctx.body);

        if (!component) {
          return notFound();
        } else {
          return ok(component);
        }
      });
  }


  router() {
    return router(
      this.createDebtCenter(),
      this.getDebtsByCenter(),
      this.getDebtCenters(),
      this.getDebtCenter(),
      this.getDebtComponentsByCenter(),
      this.createDebtCenterFromEvent(),
      this.updateDebtCenter(),
      this.deleteDebtComponent(),
      this.deleteDebtCenter(),
      this.updateDebtComponent(),
    );
  }
}

