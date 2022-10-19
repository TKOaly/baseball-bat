import { Router, route, router } from 'typera-express'
import { ok, badRequest, notFound } from 'typera-express/response'
import { DebtCentersService } from '../services/debt_centers'
import { DebtService } from '../services/debt'
import { AuthService } from '../auth-middleware'
import { Inject, Service } from 'typedi'
import { Config } from '../config'
import { EventsService } from '../services/events'
import { euro, emailIdentity, tkoalyIdentity, dateString, convertToDbDate } from '../../common/types'
import * as t from 'io-ts'
import * as E from 'fp-ts/lib/Either'
import { validateBody } from '../validate-middleware'
import { PayerService } from '../services/payer'
import { PaymentService } from '../services/payements'
import { addDays, format } from 'date-fns'
import { pipe } from 'fp-ts/lib/function'

const createDebtCenterFromEventBody = t.type({
  events: t.array(t.number),
  settings: t.type({
    name: t.string,
    description: t.string,
    basePrice: t.number,
    dueDate: dateString,
    componentMappings: t.array(t.type({
      name: t.string,
      price: t.number,
      rules: t.array(t.type({
        event: t.number,
        question: t.number,
        answer: t.string,
      })),
    })),
  }),
})

@Service()
export class DebtCentersApi {
  @Inject(() => Config)
  config: Config

  @Inject(() => DebtCentersService)
  debtCentersService: DebtCentersService

  @Inject(() => AuthService)
  authService: AuthService

  @Inject(() => DebtService)
  debtService: DebtService

  @Inject(() => EventsService)
  eventsService: EventsService

  @Inject(() => PaymentService)
  paymentService: PaymentService

  @Inject(() => PayerService)
  payerService: PayerService

  getDebtCenters() {
    return route
      .get('/')
      .use(this.authService.createAuthMiddleware())
      .handler(async () => {
        const centers = await this.debtCentersService.getDebtCenters()
        return ok(centers)
      })
  }

  getDebtCenter() {
    return route
      .get('/:id')
      .use(this.authService.createAuthMiddleware())
      .handler(async (ctx) => {
        const center = await this.debtCentersService.getDebtCenter(ctx.routeParams.id)

        if (center) {
          return ok(center)
        } else {
          return notFound()
        }
      })
  }

  getDebtsByCenter() {
    return route
      .get('/:id/debts')
      .use(this.authService.createAuthMiddleware())
      .handler(async (ctx) => {
        const debts = await this.debtService.getDebtsByCenter(ctx.routeParams.id);
        return ok(debts);
      })
  }

  getDebtComponentsByCenter() {
    return route
      .get('/:id/components')
      .use(this.authService.createAuthMiddleware())
      .handler(async (ctx) => {
        const components = await this.debtService.getDebtComponentsByCenter(ctx.routeParams.id);
        return ok(components);
      })
  }

  createDebtCenter() {
    return route
      .post('/')
      .use(this.authService.createAuthMiddleware())
      .handler(async (ctx) => {
        try {
          const center = await this.debtCentersService.createDebtCenter(ctx.req.body)
          return ok(center)
        } catch (err) {
          console.log(err)

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
      })
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
        })

        const updated = await this.debtCentersService.getDebtCenter(ctx.routeParams.id)

        return ok(updated)
      })
  }

  createDebtCenterFromEvent() {
    return route
      .post('/fromEvent')
      .use(this.authService.createAuthMiddleware())
      .use(validateBody(createDebtCenterFromEventBody))
      .handler(async (ctx) => {
        const body = ctx.body

        const registrations = await Promise.all(
          body.events.map((id) => {
            return this.eventsService.getEventRegistrations(id)
          })
        )

        const center = await this.debtCentersService.createDebtCenter({
          name: body.settings.name,
          description: body.settings.description,
          url: '',
        })

        if (!center) {
          throw new Error('Unable to create new debt center')
        }

        let baseComponentId: string | null = null

        if (body.settings.basePrice !== 0) {
          const baseComponent = await this.debtService.createDebtComponent({
            name: 'Base price',
            amount: euro(body.settings.basePrice),
            description: 'Base price for the event',
            debtCenterId: center.id,
          });

          baseComponentId = baseComponent.id
        }

        const components = await Promise.all(
          body.settings.componentMappings.map((mapping) => {
            return this.debtService.createDebtComponent({
              name: mapping.name,
              amount: euro(mapping.price),
              description: `Autogenerated from event registration fields`,
              debtCenterId: center.id,
            })
          })
        )

        await Promise.all(
          registrations.flatMap((registrations, i) => registrations.map(async (registration) => {
            const eventId = body.events[i];

            const componentIds = body.settings.componentMappings
              .flatMap((mapping, i) => {
                const matches = mapping.rules.some((rule) => {
                  console.log(eventId, rule.event, rule.answer, registration.answers.find((a) => a.question_id === rule.question)?.answer)
                  return eventId === rule.event &&
                    registration.answers
                      .find((a) => a.question_id === rule.question)?.answer === rule.answer
                })

                return matches ? [i] : [];
              })
              .map((componentIndex) => components[componentIndex].id)

            const payerIdentity = registration.userId
              ? registration.userId
              : emailIdentity(registration.email)

            const payer = await this.payerService.createPayerProfileForExternalIdentity(payerIdentity, ctx.req.cookies.token)

            if (!payer) {
              throw new Error('Unable to create payer profile for the debt')
            }

            const dueDate = convertToDbDate(body.settings.dueDate)

            if (!dueDate) {
              throw new Error('Date conversion error')
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
            })

            await this.paymentService.createPayment({
              type: 'invoice',
              message: body.settings.description,
              title: body.settings.name,
              debts: [debt.id],
              data: {},
            })
          }))
        )

        return ok(center)
      })
  }

  private deleteDebtComponent() {
    return route
      .delete('/:debtCenterId/components/:debtComponentId')
      .use(this.authService.createAuthMiddleware())
      .handler(async (ctx) => {
        const { debtCenterId, debtComponentId } = ctx.routeParams

        return pipe(
          await this.debtService.deleteDebtComponent(debtCenterId, debtComponentId),
          E.matchW(
            () => notFound(),
            ({ affectedDebts }) => ok({ affectedDebts }),
          ),
        )
      })
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
    )
  }
}

