import { Inject, Service } from "typedi";
import { route, router } from "typera-express";
import { notFound, ok, unauthorized } from "typera-express/response";
import { emailIdentity, internalIdentity, tkoalyIdentity } from "../../common/types";
import { AuthService } from "../auth-middleware";
import { DebtService } from "../services/debt";
import { PayerService } from "../services/payer";

@Service()
export class PayersApi {
  @Inject(() => PayerService)
  payerService: PayerService

  @Inject(() => AuthService)
  authService: AuthService

  @Inject(() => DebtService)
  debtService: DebtService

  private getPayer() {
    return route
      .get('/:id')
      .use(this.authService.createAuthMiddleware({ accessLevel: 'normal' }))
      .handler(async (ctx) => {
        let { id } = ctx.routeParams;

        if (ctx.routeParams.id === 'me') {
          id = ctx.session.payerId;
        }

        if (ctx.session.accessLevel === 'normal' && ctx.routeParams.id === 'me') {
          return unauthorized('Not authorized')
        }

        const payer = await this.payerService.getPayerProfileByInternalIdentity(internalIdentity(id))

        if (payer) {
          return ok(payer)
        }

        return notFound()
      })
  }

  private getPayerByEmail() {
    return route
      .get('/by-email/:email')
      .use(this.authService.createAuthMiddleware())
      .handler(async (ctx) => {
        const payer = await this.payerService.getPayerProfileByEmailIdentity(emailIdentity(ctx.routeParams.email))

        if (!payer) {
          return notFound()
        }

        return ok(payer)
      })
  }

  private getPayerByTkoalyId() {
    return route
      .get('/by-tkoaly-id/:id(int)')
      .use(this.authService.createAuthMiddleware())
      .handler(async (ctx) => {
        const payer = await this.payerService.getPayerProfileByTkoalyIdentity(tkoalyIdentity(ctx.routeParams.id))

        if (!payer) {
          return notFound()
        }

        return ok(payer)
      })
  }

  private getPayerDebts() {
    return route
      .get('/:id/debts')
      .use(this.authService.createAuthMiddleware({ accessLevel: 'normal' }))
      .handler(async (ctx) => {
        let { id } = ctx.routeParams;

        if (ctx.routeParams.id === 'me') {
          id = ctx.session.payerId;
        }

        if (ctx.session.accessLevel === 'normal' && ctx.routeParams.id === 'me') {
          return unauthorized('Not authorized')
        }

        const includeDrafts = ctx.session.accessLevel === 'admin' && ctx.req.query.includeDrafts === 'true'

        const debts = await this.debtService.getDebtsByPayer(internalIdentity(id), includeDrafts);

        return ok(debts);
      })
  }

  private getSessionPayer() {
    return route
      .get('/session')
      .use(this.authService.createAuthMiddleware({ accessLevel: 'normal' }))
      .handler(async (ctx) => {
        const payer = await this.payerService.getPayerProfileByInternalIdentity(internalIdentity(ctx.session.payerId))

        if (payer) {
          return ok(payer)
        }

        return notFound()
      })
  }

  private getPayerEmails() {
    return route
      .get('/:id/emails')
      .use(this.authService.createAuthMiddleware())
      .handler(async (ctx) => {
        const emails = await this.payerService.getPayerEmails(internalIdentity(ctx.routeParams.id))
        return ok(emails)
      })
  }

  router() {
    return router(
      this.getPayerByEmail(),
      this.getPayer(),
      this.getPayerEmails(),
      this.getSessionPayer(),
      this.getPayerDebts(),
      this.getPayerByTkoalyId()
    )
  }
}
