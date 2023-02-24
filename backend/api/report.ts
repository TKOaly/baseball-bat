import { Inject, Service } from 'typedi';
import { route, router } from 'typera-express';
import { notFound, ok } from 'typera-express/response';
import { dbDateString } from '../../common/types';
import { AuthService } from '../auth-middleware';
import { DebtService } from '../services/debt';
import { ReportService } from '../services/reports';
import { validateBody } from '../validate-middleware';
import * as t from 'io-ts';
import { parse } from 'date-fns';
import { PaymentService } from '../services/payements';

@Service()
export class ReportApi {
  @Inject(() => AuthService)
  authService: AuthService;

  @Inject(() => ReportService)
  reportService: ReportService

  @Inject(() => DebtService)
  debtService: DebtService

  @Inject(() => PaymentService)
  paymentService: PaymentService

  private getReport() {
    return route
      .get('/:id')
      .use(this.authService.createAuthMiddleware())
      .handler(async (ctx) => {
        const report = await this.reportService.getReport(ctx.routeParams.id);

        if (!report) {
          return notFound({
            message: 'Report not found.',
          });
        }

        return ok(report);
      });
  }

  private getReportContent() {
    return route
      .get('/:id/content')
      //.use(this.authService.createAuthMiddleware())
      .handler(async (ctx) => {
        const report = await this.reportService.getReportContent(ctx.routeParams.id);

        if (!report) {
          return notFound({
            message: 'Report not found.',
          });
        }

        return ok(report, { 'Content-Type': 'application/pdf' });
      });
  }

  private getReports() {
    return route
      .get('/')
      .use(this.authService.createAuthMiddleware())
      .handler(async (_ctx) => {
        const reports = await this.reportService.getReports();
        return ok(reports);
      });
  }

  private generateDebtLedgerReport() {
    return route
      .post('/generate/debt-ledger')
      .use(this.authService.createAuthMiddleware())
      .use(validateBody(t.type({
        startDate: dbDateString,
        endDate: dbDateString,
        includeDrafts: t.union([
          t.literal('include'),
          t.literal('exclude'),
          t.literal('only-drafts'),
        ]),
        groupBy: t.union([ t.null, t.literal('payer'), t.literal('center') ]),
        centers: t.union([ t.null, t.array(t.string) ]),
      })))
      .handler(async (ctx) => {
        const report = await this.debtService.generateDebtLedger({
          startDate: parse(ctx.body.startDate, 'yyyy-MM-dd', new Date()),
          endDate: parse(ctx.body.endDate, 'yyyy-MM-dd', new Date()),
          includeDrafts: ctx.body.includeDrafts,
          groupBy: ctx.body.groupBy,
          centers: ctx.body.centers,
        });

        return ok(report);
      })
  }

  private generatePaymentLedgerReport() {
    return route
      .post('/generate/payment-ledger')
      .use(this.authService.createAuthMiddleware())
      .use(validateBody(t.type({
        startDate: dbDateString,
        endDate: dbDateString,
        paymentType: t.union([ t.null, t.literal('cash'), t.literal('invoice') ]),
        center: t.union([ t.null, t.string ]),
      })))
      .handler(async (ctx) => {
        const report = await this.paymentService.generatePaymentLedger({
          startDate: parse(ctx.body.startDate, 'yyyy-MM-dd', new Date()),
          endDate: parse(ctx.body.endDate, 'yyyy-MM-dd', new Date()),
          paymentType: ctx.body.paymentType,
          centers: ctx.body.center ? [ ctx.body.center ] : null,
        });

        return ok(report);
      });
  }

  router() {
    return router(
      this.getReport(),
      this.getReports(),
      this.getReportContent(),
      this.generateDebtLedgerReport(),
      this.generatePaymentLedgerReport(),
    );
  }
}
