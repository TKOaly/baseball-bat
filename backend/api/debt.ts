import { Router, route, router, Route, Response, Middleware } from 'typera-express'
import { AuthService } from '../auth-middleware'
import { CreateDebtOptions, DebtService } from '../services/debt'
import { badRequest, internalServerError, notFound, ok, unauthorized } from 'typera-express/response'
import { validate } from 'uuid'
import { Inject, Service } from 'typedi'
import { Config } from '../config'
import { DebtCentersService } from '../services/debt_centers'
import { Type, TypeOf } from 'io-ts'
import * as t from 'io-ts'
import { convertToDbDate, DateString, dateString, dbDateString, DbDateString, Debt, DebtComponent, Email, emailIdentity, euro, internalIdentity, PayerProfile, tkoalyIdentity } from '../../common/types'
import { PayerService } from '../services/payer'
import { validateBody } from '../validate-middleware'
import { PaymentService } from '../services/payements'
import { EmailService } from '../services/email'
import { parse, format, addDays, isMatch, parseISO, isPast } from 'date-fns'
import { split } from 'fp-ts/lib/string'
import { reduce, reverse } from 'fp-ts/lib/ReadonlyNonEmptyArray'
import { flow, pipe } from 'fp-ts/lib/function'
import * as E from 'fp-ts/lib/Either'
import * as A from 'fp-ts/lib/Array'
import * as TE from 'fp-ts/lib/TaskEither'
import * as T from 'fp-ts/lib/Task'
import * as S from 'fp-ts/lib/string'
import { concatAll } from 'fp-ts/lib/Monoid'
import { Either, foldW } from 'fp-ts/lib/Either'
import { euroValue } from '../../common/currency'
import { UsersService } from '../services/users'
import { uniqBy } from 'remeda'
import * as EQ from 'fp-ts/lib/Eq'


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

  @Inject(() => UsersService)
  usersService: UsersService

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

  private getDebtsByPayment() {
    return route
      .get('/by-payment/:id')
      .use(this.authService.createAuthMiddleware({ accessLevel: 'normal' }))
      .handler(async (ctx) => {
        const payment = await this.paymentService.getPayment(ctx.routeParams.id);

        if (!payment) {
          return notFound()
        }

        if (ctx.session.accessLevel != 'admin' && payment.payer_id !== ctx.session.payerId) {
          return unauthorized()
        }

        const debts = await this.debtService.getDebtsByPayment(payment.id);
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
                dueDate: debt.dueDate,
                amount: total,
                referenceNumber: payment.data?.reference_number ?? '<ERROR>',
                link: `${this.config.appUrl}/payment/${debt.id}`,
                message: debt.description,
              },
              subject: '[Lasku / Invoice] ' + debt.name,
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
          dueDate: t.string,
          components: t.array(t.string),
        }),
      })))
      .use(this.authService.createAuthMiddleware())
      .handler(async (ctx) => {
        const update = (id: string) => async () => {
          return await this.debtService.updateDebt({
            id: id,
            name: ctx.body.values.name,
            description: ctx.body.values.description,
            centerId: ctx.body.values.centerId,
            dueDate: ctx.body.values.dueDate === undefined ? undefined : parseISO(ctx.body.values.dueDate),
            payerId: ctx.body.values.payerId,
            components: ctx.body.values.components ?? [],
          })
        }

        return pipe(
          ctx.body.debts,
          A.traverse(TE.ApplicativePar)(update),
          T.map(E.matchW(
            () => badRequest(),
            (debts) => ok(debts),
          )),
        )()
      })
  }

  private updateDebt() {
    return route
      .patch('/:id')
      .use(validateBody(t.partial({
        name: t.string,
        description: t.string,
        payerId: payerIdentity,
        centerId: t.string,
        dueDate: t.string,
        components: t.array(t.string),
      })))
      .use(this.authService.createAuthMiddleware())
      .handler(async (ctx) => {
        const updated = await this.debtService.updateDebt({
          id: ctx.routeParams.id,
          name: ctx.body.name,
          description: ctx.body.description,
          centerId: ctx.body.centerId,
          dueDate: ctx.body.dueDate === undefined ? undefined : parseISO(ctx.body.dueDate),
          payerId: ctx.body.payerId,
          components: ctx.body.components ?? [],
        })

        return pipe(
          updated,
          E.foldW(
            () => badRequest(),
            (debt) => ok(debt),
          )
        )
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
        const payer = await this.payerService.getPayerProfileByEmailIdentity(emailIdentity(email))

        if (payer) {
          return payer;
        }

        const user = await this.usersService.getUpstreamUserByEmail(email, token)

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
            }
          } else {
            return await this.payerService.createPayerProfileFromTkoalyIdentity(tkoalyIdentity(user.id), token)
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
            }
          } else {
            let payer = await this.payerService.createPayerProfileFromEmailIdentity(emailIdentity(email), { name })
            return payer
          }
        }
      }

      return null;
    }

    const resolveDebtCenter = async (debtCenter: string, dryRun: boolean) => {
      if (validate(debtCenter)) {
        const byId = await this.debtCentersService.getDebtCenter(debtCenter);
        return byId;
      }

      const byName = await this.debtCentersService.getDebtCenterByName(debtCenter)

      if (byName) {
        return byName
      }

      if (dryRun) {
        return {
          id: '',
          name: debtCenter,
          description: '',
          url: '',
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      } else {
        return await this.debtCentersService.createDebtCenter({
          name: debtCenter,
          description: '',
          url: '',
        })
      }
    }

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
          //paymentNumber: t.string,
          //referenceNumber: t.string,
        }),
        debts: t.array(t.partial({
          tkoalyUserId: t.number,
          debtCenter: t.string,
          title: t.string,
          description: t.string,
          email: t.string,
          amount: euroValue,
          dueDate: dateString,
          components: t.array(t.string),
          paymentNumber: t.string,
          referenceNumber: t.string,
        })),
        components: t.array(t.type({
          name: t.string,
          amount: euroValue,
        })),
        dryRun: t.boolean,
      })))
      .handler(async (ctx) => {
        const { debts, defaults, dryRun, components } = ctx.body

        try {
          const handleDebt = async (debt: typeof debts[0], index: number) => {
            const details = { ...defaults, ...debt }

            const payer = await resolvePayer(details, ctx.req.cookies.token, dryRun)

            if (!payer && !details.email) {
              return Promise.reject({ debtIndex: index, error: 'NO_PAYER_OR_EXPLICIT_EMAIL' })
            }

            let email = details.email
            let emailSource = 'explicit'

            if (!email && payer) {
              const primary = await this.payerService.getPayerPrimaryEmail(payer.id)

              if (!primary) {
                return Promise.reject({ debtIndex: index, error: 'PAYER_HAS_NO_EMAIL' })
              }

              email = primary.email
              emailSource = 'profile'
            }

            if (!details.title) {
              return Promise.reject({ debtIndex: index, error: 'MISSING_FIELD', field: 'title' })
            }

            if (!details.description) {
              details.description = ''
            }

            if (!details.debtCenter) {
              return Promise.reject({ debtIndex: index, error: 'MISSING_FIELD', field: 'debtCenter' })
            }

            const debtCenter = await resolveDebtCenter(details.debtCenter, dryRun)

            if (!debtCenter) {
              return Promise.reject({ debtIndex: index, error: 'COULD_NOT_RESOLVE', field: 'debtCenter' })
            }

            if (!details.dueDate) {
              return Promise.reject({ debtIndex: index, error: 'MISSING_FIELD', field: 'dueDate' })
            }

            let dueDate = convertToDbDate(details.dueDate)

            if (!dueDate) {
              return Promise.reject({ debtIndex: index, error: 'COULD_NOT_RESOLVE', field: 'dueDate' })
            }

            let createdDebt: Debt | null = null
            let debtComponents: Array<DebtComponent> = []

            if (!dryRun) {
              if (!payer) {
                return Promise.reject({
                  debtIndex: index,
                  error: 'NO_PAYER',
                })
              }

              const existingDebtComponents = await this.debtService.getDebtComponentsByCenter(debtCenter.id as any)

              debtComponents = await Promise.all((details?.components ?? []).map(async (c) => {
                const match = existingDebtComponents.find(ec => ec.name === c)

                if (match) {
                  return match
                }

                const componentDetails = components.find(({ name }) => name === c)

                if (componentDetails) {
                  return await this.debtService.createDebtComponent({
                    name: c,
                    amount: componentDetails.amount,
                    debtCenterId: debtCenter.id,
                    description: c,
                  })
                }

                return Promise.reject({ debtIndex: index, error: 'NO_SUCH_COMPONENT' })
              }))

              if (details.amount) {
                const existingBasePrice = existingDebtComponents.find((dc) => {
                  console.log(dc, details)
                  return dc.name === 'Base Price' && dc.amount.value === details.amount?.value && dc.amount.currency === details.amount?.currency;
                })

                if (existingBasePrice) {
                  debtComponents.push(existingBasePrice)
                } else {
                  debtComponents.push(await this.debtService.createDebtComponent({
                    name: 'Base Price',
                    amount: details.amount,
                    debtCenterId: debtCenter.id,
                    description: 'Base Price',
                  }))
                }
              }

              let options: CreateDebtOptions = {}

              if (details.paymentNumber) {
                options.paymentNumber = details.paymentNumber
              }

              if (details.referenceNumber) {
                options.defaultPaymentReferenceNumber = details.referenceNumber
              }

              createdDebt = await this.debtService.createDebt({
                centerId: debtCenter.id,
                description: details.description,
                name: details.title,
                payer: payer.id,
                dueDate,
                components: debtComponents.map(c => c.id),
              }, options)
            } else {
              createdDebt = {
                id: '',
                payerId: payer?.id ?? internalIdentity(''),
                name: details.title,
                description: details.description,
                draft: true,
                debtCenterId: debtCenter.id,
                status: 'unpaid',
                lastReminded: null,
                dueDate: parseISO(dueDate),
                createdAt: new Date(),
                updatedAt: new Date(),
                debtComponents,
                credited: false,
              }

              if (details.components && details.components.length > 0) {
                debtComponents = await Promise.all(details.components.map(async (c) => {
                  const componentDetails = components.find(({ name }) => name === c)

                  if (componentDetails) {
                    return {
                      id: '',
                      name: c,
                      amount: componentDetails.amount,
                      description: '',
                      debtCenterId: debtCenter.id,
                      createdAt: new Date(),
                      updatedAt: new Date(),
                    } as DebtComponent
                  }

                  const existing = await this.debtService.getDebtComponentsByCenter(debtCenter.id)
                  const match = existing.find(ec => ec.name === c)

                  if (match) {
                    return match
                  }

                  return Promise.reject({ debtIndex: index, error: 'NO_SUCH_COMPONENT' })
                }))
              }

              if (details.amount) {
                debtComponents.push({
                  id: '8d12e7ef-51db-465e-a5fa-b01cf01db5a8',
                  name: 'Base Price',
                  amount: details.amount,
                  description: 'Base Price',
                  debtCenterId: debtCenter.id,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                })
              }
            }

            return {
              payer,
              email,
              emailSource,
              debt: createdDebt,
              components: debtComponents,
              debtCenter,
            }
          }

          // Run handleDebt sequentically over debts
          const results = await debts.reduce(
            (prev, debt, index) => prev.then(async (results) => [...results, await handleDebt(debt, index)]),
            Promise.resolve([] as Array<Awaited<ReturnType<typeof handleDebt>>>),
          )

          return ok(results)
        } catch (e) {
          console.error(e)
          return internalServerError(e)
        }
      })
  }

  private deleteDebt() {
    return route
      .delete('/:id')
      .use(this.authService.createAuthMiddleware())
      .handler(async (ctx) => {
        await this.debtService.deleteDebt(ctx.routeParams.id);

        return ok()
      })
  }

  private creditDebt() {
    return route
      .post('/:id/credit')
      .use(this.authService.createAuthMiddleware())
      .handler(async (ctx) => {
        await this.debtService.creditDebt(ctx.routeParams.id);

        return ok()
      })
  }

  private markPaidWithCash() {
    return route
      .post('/:id/mark-paid-with-cash')
      .use(this.authService.createAuthMiddleware())
      .handler(async (ctx) => {
        const debt = await this.debtService.getDebt(ctx.routeParams.id);

        if (!debt) {
          return notFound('Debt not found')
        }

        if (debt.draft) {
          return badRequest('Cannot mark draft debts as paid')
        }

        if (debt.credited) {
          return badRequest('Cannot mark credited debts as paid')
        }

        if (debt.status === 'paid') {
          return badRequest('Debt already paid')
        }

        const payment = await this.paymentService.createPayment({
          type: 'cash',
          title: 'Cash Payment',
          message: `Cash payment of debt "${debt.name}"`,
          debts: [debt.id],
          data: {},
        })

        await this.paymentService.createPaymentEvent(payment.id, {
          type: 'payment',
          amount: await this.debtService.getDebtTotal(debt.id),
        })

        return ok(payment)
      })
  }

  private sendAllReminders() {
    return route
      .post('/send-reminders')
      .use(validateBody(t.type({
        send: t.boolean,
        ignoreCooldown: t.boolean,
      })))
      .use(this.authService.createAuthMiddleware())
      .handler(async (ctx) => {
        const getEmailPayerId = ([_, debt]: [Email, Debt]) => debt.payerId.value
        const EmailPayerEq = EQ.contramap(getEmailPayerId)(S.Eq)

        return pipe(
          () => this.debtService.sendAllReminders(!ctx.body.send, ctx.body.ignoreCooldown),
          T.map(({ left, right }) => ok({
            messageCount: right.length,
            payerCount: A.uniq(EmailPayerEq)(right).length,
            errors: left,
          })),
        )()
      })
  }

  private sendReminder() {
    return route
      .post('/:id/send-reminder')
      .use(this.authService.createAuthMiddleware())
      .handler(async (ctx) => {
        const debt = await this.debtService.getDebt(ctx.routeParams.id);

        if (!debt) {
          return notFound('Debt not found')
        }

        const result = await this.debtService.sendReminder(debt);

        if (E.isRight(result)) {
          return ok(result.right)
        } else {
          return internalServerError(result.left)
        }
      })
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
      this.deleteDebt(),
      this.creditDebt(),
      this.markPaidWithCash(),
      this.sendReminder(),
      this.updateDebt(),
      this.updateMultipleDebts(),
    )
  }
}
