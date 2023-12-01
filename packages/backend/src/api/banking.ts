import { Inject, Service } from 'typedi';
import { Middleware, route, router } from 'typera-express';
import { badRequest, ok } from 'typera-express/response';
import { bankAccount } from '@bbat/common/build/src/types';
import { AuthService } from '../auth-middleware';
import { parseCamtStatement } from '@bbat/common/build/src/camt-parser';
import { BankingService } from '../services/banking';
import { validateBody } from '../validate-middleware';
import multer from 'multer';
import { PaymentService } from '../services/payements';

@Service()
export class BankingApi {
  @Inject(() => BankingService)
  bankingService: BankingService;

  @Inject(() => PaymentService)
  paymentService: PaymentService;

  @Inject(() => AuthService)
  authService: AuthService;

  private upload = multer({
    storage: multer.memoryStorage(),
  });

  private getBankAccounts() {
    return route
      .get('/accounts')
      .use(this.authService.createAuthMiddleware())
      .handler(async () => {
        const accounts = await this.bankingService.getBankAccounts();

        return ok(accounts);
      });
  }

  private createBankAccount() {
    return route
      .post('/accounts')
      .use(this.authService.createAuthMiddleware())
      .use(validateBody(bankAccount))
      .handler(async ctx => {
        await this.bankingService.createBankAccount(ctx.body);

        return ok();
      });
  }

  private getBankAccount() {
    return route
      .get('/accounts/:iban')
      .use(this.authService.createAuthMiddleware())
      .handler(async ctx => {
        const account = await this.bankingService.getBankAccount(
          ctx.routeParams.iban,
        );
        return ok(account);
      });
  }

  private getBankAccountStatements() {
    return route
      .get('/accounts/:iban/statements')
      .use(this.authService.createAuthMiddleware())
      .handler(async ctx => {
        const statements = await this.bankingService.getAccountStatements(
          ctx.routeParams.iban,
        );
        return ok(statements);
      });
  }

  private createBankStatement() {
    return route
      .post('/statements')
      .use(this.authService.createAuthMiddleware())
      .use(
        Middleware.wrapNative(this.upload.single('statement'), ({ req }) => ({
          file: req.file,
        })),
      )
      .handler(async ctx => {
        if (!ctx.file) {
          return badRequest('File `statement` required.');
        }

        const content = ctx.file.buffer.toString('utf8');
        const statement = await parseCamtStatement(content);

        await this.bankingService.createBankStatement({
          id: statement.id,
          accountIban: statement.account.iban,
          generatedAt: statement.creationDateTime,
          transactions: statement.entries.map(entry => ({
            id: entry.id,
            amount: entry.amount,
            date: entry.valueDate,
            type: entry.type,
            otherParty: entry.otherParty,
            message: entry.message,
            reference: entry.reference,
          })),
          openingBalance: statement.openingBalance,
          closingBalance: statement.closingBalance,
        });

        return ok();
      });
  }

  private getAccountTransactions() {
    return route
      .get('/accounts/:iban/transactions')
      .use(this.authService.createAuthMiddleware())
      .handler(async ctx => {
        const transactions = await this.bankingService.getAccountTransactions(
          ctx.routeParams.iban,
        );

        return ok(transactions);
      });
  }

  private getBankStatement() {
    return route
      .get('/statements/:id')
      .use(this.authService.createAuthMiddleware())
      .handler(async ctx => {
        const statement = await this.bankingService.getBankStatement(
          ctx.routeParams.id,
        );

        return ok(statement);
      });
  }

  private getBankStatementTransactions() {
    return route
      .get('/statements/:id/transactions')
      .use(this.authService.createAuthMiddleware())
      .handler(async ctx => {
        const transactions =
          await this.bankingService.getBankStatementTransactions(
            ctx.routeParams.id,
          );

        return ok(transactions);
      });
  }

  private autoregisterTransactions() {
    return route
      .post('/autoregister')
      .use(this.authService.createAuthMiddleware())
      .handler(async _ctx => {
        const transactions =
          await this.bankingService.getTransactionsWithoutRegistration();

        for (const tx of transactions) {
          await this.paymentService.createPaymentEventFromTransaction(tx);
        }

        return ok();
      });
  }

  private getTransactionRegistrations() {
    return route
      .get('/transactions/:id/registrations')
      .use(this.authService.createAuthMiddleware())
      .handler(async ctx => {
        const events = await this.bankingService.getTransactionRegistrations(
          ctx.routeParams.id,
        );
        return ok(events);
      });
  }

  router() {
    return router(
      this.getBankAccounts(),
      this.createBankAccount(),
      this.getBankAccount(),
      this.createBankStatement(),
      this.getAccountTransactions(),
      this.getBankAccountStatements(),
      this.getBankStatement(),
      this.getBankStatementTransactions(),
      this.autoregisterTransactions(),
      this.getTransactionRegistrations(),
    );
  }
}
