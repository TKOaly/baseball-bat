import { Inject, Service } from "typedi";
import { route, router } from "typera-express";
import { ok } from "typera-express/response";
import { AuthService } from "../auth-middleware";
import { AccountingService } from "../services/accounting";

@Service()
export class AccountingApi {
  @Inject(() => AccountingService)
  accountingService: AccountingService;

  @Inject(() => AuthService)
  authService: AuthService;

  private getAccountingPeriods() {
    return route
      .get('/periods')
      .use(this.authService.createAuthMiddleware())
      .handler(async (_ctx) => {
        const periods = await this.accountingService.getAccountingPeriods();
        return ok(periods);
      })
  }

  public router() {
    return router(
      this.getAccountingPeriods(),
    );
  }
}
