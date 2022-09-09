import { Inject, Service } from "typedi";
import { route, router } from "typera-express";
import { badRequest, ok, unauthorized } from "typera-express/response";
import * as t from 'io-ts'
import { tkoalyIdentity } from "../../common/types";
import { AuthService } from "../auth-middleware";
import { DebtService } from "../services/debt";
import { PaymentService } from "../services/payements";
import { PayerService } from "../services/payer";
import { UsersService } from "../services/users";
import { validateBody } from "../validate-middleware";
import { euro, formatEuro, sumEuroValues } from "../../common/currency";

@Service()
export class PaymentsApi {
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

        const payment = await this.paymentService.createInvoice({
          series: 9,
          debts: debts.map(d => d.id),
          title: 'Comined invoice',
          message: 'Invoice for the following debts:' + (debts.map(d => `\n - ${d.name} (${formatEuro(d.debtComponents.map(dc => dc.amount).reduce(sumEuroValues, euro(0)))})`)),
        });

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
