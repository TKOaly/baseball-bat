import { Inject, Service } from "typedi";
import { route, router } from "typera-express";
import { badRequest, internalServerError, ok, unauthorized } from "typera-express/response";
import * as t from 'io-ts'
import { internalIdentity, tkoalyIdentity } from "../../common/types";
import { AuthService } from "../auth-middleware";
import { DebtService } from "../services/debt";
import { PaymentService } from "../services/payements";
import { PayerService } from "../services/payer";
import { UsersService } from "../services/users";
import { validateBody } from "../validate-middleware";
import { euro, formatEuro, sumEuroValues } from "../../common/currency";
import { EmailService } from "../services/email";
import { Config } from "../config";
import { parseISO } from "date-fns";

@Service()
export class PaymentsApi {
  @Inject(() => Config)
  config: Config

  @Inject(() => PaymentService)
  paymentService: PaymentService

  @Inject(() => UsersService)
  usersService: UsersService

  @Inject(() => PayerService)
  payerService: PayerService

  @Inject(() => AuthService)
  authService: AuthService

  @Inject(() => DebtService)
  debtService: DebtService

  @Inject(() => EmailService)
  emailService: EmailService

  private getPayments() {
    return route
      .get('/')
      .use(this.authService.createAuthMiddleware())
      .handler(async () => {
        const payments = await this.paymentService.getPayments();
        return ok(payments);
      })
  }

  private getPayment() {
    return route
      .get('/:id')
      .use(this.authService.createAuthMiddleware())
      .handler(async (ctx) => {
        const payment = await this.paymentService.getPayment(ctx.routeParams.id);
        const debts = await this.debtService.getDebtsByPayment(ctx.routeParams.id);
        return ok({
          payment,
          debts,
        });
      })
  }

  private createInvoice() {
    return route
      .post('/create-invoice')
      .use(this.authService.createAuthMiddleware({ accessLevel: 'normal' }))
      .use(validateBody(t.type({
        debts: t.array(t.string),
        sendEmail: t.boolean,
      })))
      .handler(async (ctx) => {
        const debts = await Promise.all(ctx.body.debts.map(async (id) => {
          const debt = await this.debtService.getDebt(id);

          if (!debt) {
            return Promise.reject(badRequest());
          }

          if (ctx.session.accessLevel !== 'admin' && debt.payerId.value !== ctx.session.payerId) {
            return Promise.reject(unauthorized());
          }


          return debt;
        }))

        const totals = await Promise.all(debts.map(d => this.debtService.getDebtTotal(d.id)));
        const total = totals.reduce(sumEuroValues, euro(0))

        if (!debts.every(d => d.payerId.value === debts[0].payerId.value)) {
          return badRequest('All debts do not have the same payer')
        }

        const email = await this.payerService.getPayerPrimaryEmail(debts[0].payerId)

        if (!email) {
          throw new Error(`Payer ${debts[0].payerId} does not have a primary email`)
        }

        const payment = await this.paymentService.createInvoice({
          series: 9,
          debts: debts.map(d => d.id),
          title: 'Combined invoice',
          message: 'Invoice for the following debts:\n' + (debts.map(d => ` - ${d.name} (${formatEuro(d.debtComponents.map(dc => dc.amount).reduce(sumEuroValues, euro(0)))})`).join('\n')),
        });

        console.log(payment.data)

        if (ctx.body.sendEmail) {
          const createdEmail = await this.emailService.createEmail({
            template: 'new-payment',
            recipient: email.email,
            subject: 'Uusi lasku // New invoice',
            payload: {
              title: payment.title,
              number: payment.payment_number,
              date: payment.created_at,
              due_date: parseISO(payment.data.due_date),
              reference_number: payment.data.reference_number,
              link: `${this.config.appUrl}/payment/${payment.id}`,
              amount: total,
              message: payment.message,
            },
          })

          if (createdEmail === null) {
            throw new Error('unable to create an email for the invoice')
          }

          await this.emailService.sendEmail(createdEmail.id)
        }

        return ok(payment);
      })
  }

  private getOwnPayments() {
    return route
      .get('/my')
      .use(this.authService.createAuthMiddleware())
      .handler(async ({ req }) => {
        const upstreamUser = await this.usersService.getUpstreamUser(req.cookies.token)
        const payerProfile = await this.payerService.getPayerProfileByIdentity(tkoalyIdentity(upstreamUser.id))

        if (!payerProfile) {
          throw new Error('Failed to get payer profile')
        }

        const payments = await this.paymentService.getPayerPayments(payerProfile.id)
        return ok(payments)
      })
  }

  router() {
    return router(
      this.getPayments(),
      this.getOwnPayments(),
      this.createInvoice(),
      this.getPayment()
    )
  }
}
