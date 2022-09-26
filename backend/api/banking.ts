import { Inject, Service } from "typedi";
import { route, router } from "typera-express";
import { ok } from "typera-express/response";
import { bankAccount } from "../../common/types";
import { AuthService } from "../auth-middleware";
import { BankingService } from "../services/banking";
import { validateBody } from "../validate-middleware";

@Service()
export class BankingApi {
  @Inject(() => BankingService)
  bankingService: BankingService

  @Inject(() => AuthService)
  authService: AuthService

  private getBankAccounts() {
    return route
      .get('/accounts')
      .use(this.authService.createAuthMiddleware())
      .handler(async (_ctx) => {
        const accounts = await this.bankingService.getBankAccounts();

        return ok(accounts);
      })
  }

  private createBankAccount() {
    return route
      .post('/accounts')
      .use(this.authService.createAuthMiddleware())
      .use(validateBody(bankAccount))
      .handler(async (ctx) => {
        await this.bankingService.createBankAccount(ctx.body);

        return ok();
      })
  }

  router() {
    return router(
      this.getBankAccounts(),
      this.createBankAccount(),
    )
  }
}
