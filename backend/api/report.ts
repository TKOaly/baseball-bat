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

@Service()
export class ReportApi {
  @Inject(() => AuthService)
  authService: AuthService;

  @Inject(() => ReportService)
  reportService: ReportService

  @Inject(() => DebtService)
  debtService: DebtService

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
        includeDrafts: t.boolean,
        groupBy: t.union([ t.null, t.literal('payer'), t.literal('center') ]),
      })))
      .handler(async (ctx) => {
        const report = await this.debtService.generateDebtLedger({
          startDate: parse(ctx.body.startDate, 'yyyy-MM-dd', new Date()),
          endDate: parse(ctx.body.endDate, 'yyyy-MM-dd', new Date()),
          includeDrafts: ctx.body.includeDrafts,
          groupBy: ctx.body.groupBy,
        });

        return ok(report);
      })
  }

  router() {
    return router(
      this.getReport(),
      this.getReports(),
      this.getReportContent(),
      this.generateDebtLedgerReport(),
    );
  }
}
