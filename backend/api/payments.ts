import { Inject, Service } from "typedi";
import { route, router } from "typera-express";
import { ok } from "typera-express/response";
import { tkoalyIdentity } from "../../common/types";
import { AuthService } from "../auth-middleware";
import { DebtService } from "../services/debt";
import { PaymentService } from "../services/payements";
import { PayerService } from "../services/payer";
import { UsersService } from "../services/users";

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
      this.getPayment()
    )
  }
}
