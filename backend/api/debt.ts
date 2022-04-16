import { Router, route, router, Route, Response, Middleware } from 'typera-express'
import { AuthService } from '../auth-middleware'
import { DebtService } from '../services/debt'
import { badRequest, internalServerError, notFound, ok, unauthorized } from 'typera-express/response'
import { Inject, Service } from 'typedi'
import { Config } from '../config'
import { DebtCentersService } from '../services/debt_centers'
import { Type, TypeOf } from 'io-ts'
import * as t from 'io-ts'
import { convertToDbDate, DateString, dateString, dbDateString, DbDateString, euro } from '../../common/types'
import { PayerService } from '../services/payer'
import { validateBody } from '../validate-middleware'
import { PaymentService } from '../services/payements'
import { EmailService } from '../services/email'
import { isMatch } from 'date-fns'
import { split } from 'fp-ts/lib/string'
import { reduce, reverse } from 'fp-ts/lib/ReadonlyNonEmptyArray'
import { pipe } from 'fp-ts/lib/pipeable'
import { flow } from 'fp-ts/lib/function'
import { foldW } from 'fp-ts/lib/Either'


const debtCenter = t.type({
  name: t.string,
  url: t.string,
  description: t.string
})

const newOrExisting = <T>(type: Type<T>) => t.union([
  type,
  t.type({
    id: t.string,
  })
])

const payerIdentity = t.union([
  t.type({ type: t.literal('tkoaly'), value: t.number }),
  t.type({ type: t.literal('email'), value: t.string }),
  t.type({ type: t.literal('internal'), value: t.string }),
])

const debtComponent = t.type({
  name: t.string,
  amount: t.number,
  description: t.string,
})

const createDebtPayload = t.type({
  name: t.string,
  center: t.union([debtCenter, t.string]),
  payer: payerIdentity,
  description: t.string,
  components: t.array(newOrExisting(debtComponent)),
  due_date: dateString,
})

type CreateDebtPayload = TypeOf<typeof createDebtPayload>

@Service()
export class DebtApi {
  @Inject(() => Config)
  config: Config

  @Inject(() => DebtService)
  debtService: DebtService

  @Inject(() => PayerService)
  payerService: PayerService

  @Inject(() => PaymentService)
  paymentService: PaymentService

  @Inject(() => AuthService)
  authService: AuthService

  @Inject(() => DebtCentersService)
  debtCentersService: DebtCentersService

  @Inject(() => EmailService)
  emailService: EmailService

  private createDebtComponent() {
    return route
      .post('/component')
      .use(this.authService.createAuthMiddleware())
      .handler(async (ctx) => {
        const component = await this.debtService.createDebtComponent(ctx.req.body);
        return ok(component);
      })
  }

  private getDebt() {
    return route
      .get('/:id')
      .use(this.authService.createAuthMiddleware({ accessLevel: 'normal' }))
      .handler(async (ctx) => {
        const debt = await this.debtService.getDebt(ctx.routeParams.id);

        if (!debt) {
          return notFound()
        }

        if (ctx.session.accessLevel === 'normal' && debt.payerId.value !== ctx.session.payerId) {
          return unauthorized()
        }

        return ok(debt);
      })
  }

  private getDebts() {
    return route
      .get('/')
      .use(this.authService.createAuthMiddleware())
      .handler(async () => {
        const debts = await this.debtService.getDebts();
        return ok(debts);
      })
  }

  private publishDebts() {
    return route
      .post('/publish')
      .use(this.authService.createAuthMiddleware())
      .use(validateBody(t.type({ ids: t.array(t.string) })))
      .handler(async ({ body }) => {
        await Promise.all(body.ids.map(async (id) => {
          const debt = await this.debtService.getDebt(id);

          if (!debt) {
            return Promise.reject('No such debt')
          }

          const email = await this.payerService.getPayerPrimaryEmail(debt.payerId)

          if (!email) {
            return Promise.reject('No email for payer found')
          }

          await this.debtService.publishDebt(id);

          const payment = await this.paymentService.getDefaultInvoicePaymentForDebt(id);

          if (payment) {
            if (!('reference_number' in payment.data)) {
              // return Promise.reject('No reference number for payment')
            }

            const total = await this.debtService.getDebtTotal(id);

            await this.emailService.createEmail({
              template: 'new-payment',
              recipient: email.email,
              payload: {
                title: debt.name,
                number: payment.payment_number,
                date: payment.created_at,
                due_date: debt.dueDate,
                amount: total,
                reference_number: payment.data?.reference_number ?? '<ERROR>',
                link: `${this.config.appUrl}/payment/${debt.id}/details`,
              },
              subject: 'Uusi lasku // New invoice',
            });
          }

          return;
        }))


        return ok()
      })
  }

  private createDebt() {
    return route
      .post('/')
      .use(this.authService.createAuthMiddleware())
      .use(validateBody(createDebtPayload))
      .handler(async (ctx) => {
        const payload = ctx.body

        const payer = await this.payerService.getOrCreatePayerProfileForIdentity(payload.payer, ctx.req.cookies.token)

        if (!payer) {
          throw new Error('Could not find or create a payer profile for the payer')
        }

        let centerId: string

        if (typeof payload.center === 'string') {
          centerId = payload.center
        } else {
          const center = await this.debtCentersService.createDebtCenter({
            name: payload.center.name,
            description: payload.center.description,
            url: payload.center.url,
          });

          if (!center) {
            throw new Error('Failed to create a new debt center')
          }

          centerId = center.id
        }

        const componentIds = await Promise.all(
          payload.components
            .map(async (component) => {
              if ('id' in component) {
                return component.id;
              }

              const createdComponent = await this.debtService.createDebtComponent({
                ...component,
                amount: euro(component.amount),
                debtCenterId: centerId,
              });

              return createdComponent.id;
            })
        )
        const dueDate = convertToDbDate(payload.due_date)

        if (!dueDate) {
          return internalServerError('Date conversion error')
        }

        const debt = await this.debtService.createDebt({
          name: payload.name,
          description: payload.description,
          components: componentIds,
          centerId,
          payer: payer.id,
          dueDate,
        });

        return ok(debt);
      })
  }

  private getPaymentsContainingDebt() {
    return route
      .get('/:id/payments')
      .use(this.authService.createAuthMiddleware({ accessLevel: 'normal' }))
      .handler(async (ctx) => {
        const debt = await this.debtService.getDebt(ctx.routeParams.id)

        if (!debt) {
          return notFound()
        }

        if (ctx.session.accessLevel === 'normal' && debt.payerId.value !== ctx.session.payerId) {
          return unauthorized()
        }

        const payments = await this.paymentService.getPaymentsContainingDebt(ctx.routeParams.id)

        return ok(payments)
      })
  }

  public router(): Router {
    return router(
      this.createDebtComponent(),
      this.createDebt(),
      this.getDebt(),
      this.getDebts(),
      this.publishDebts(),
      this.getPaymentsContainingDebt()
    )
  }
}
