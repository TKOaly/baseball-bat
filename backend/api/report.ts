import { Inject, Service } from 'typedi';
import { route, router } from 'typera-express';
import { notFound, ok } from 'typera-express/response';
import { AuthService } from '../auth-middleware';
import { ReportService } from '../services/reports';

@Service()
export class ReportApi {
  @Inject(() => AuthService)
  authService: AuthService;

  @Inject(() => ReportService)
  reportService: ReportService

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
      .handler(async (ctx) => {
        const reports = await this.reportService.getReports();
        return ok(reports);
      });
  }

  router() {
    return router(
      this.getReport(),
      this.getReports(),
      this.getReportContent(),
    );
  }
}
