import { route, router } from 'typera-express';
import { notFound, ok } from 'typera-express/response';
import { dbDateString, internalIdentity } from '@bbat/common/build/src/types';
import { validateBody } from '../validate-middleware';
import * as t from 'io-ts';
import { parse } from 'date-fns';
import * as reportService from '@/services/reports/definitions';
import * as debtService from '@/services/debts/definitions';
import * as paymentService from '@/services/payments/definitions';
import { ApiDeps } from '.';

export default ({ auth, bus }: ApiDeps) => {
  const getReport = route
    .get('/:id')
    .use(auth.createAuthMiddleware())
    .handler(async ctx => {
      const report = await bus.exec(
        reportService.getReport,
        ctx.routeParams.id,
      );

      if (!report) {
        return notFound({
          message: 'Report not found.',
        });
      }

      return ok(report);
    });

  const getReportContent = route
    .get('/:id/content')
    //.use(auth.createAuthMiddleware())
    .handler(async ctx => {
      const report = await bus.exec(
        reportService.getReportContent,
        ctx.routeParams.id,
      );

      if (!report) {
        return notFound({
          message: 'Report not found.',
        });
      }

      return ok(report, { 'Content-Type': 'application/pdf' });
    });

  const getReports = route
    .get('/')
    .use(auth.createAuthMiddleware())
    .handler(async _ctx => {
      const reports = await bus.exec(reportService.getReports);
      return ok(reports);
    });

  const generateDebtLedgerReport = route
    .post('/generate/debt-ledger')
    .use(auth.createAuthMiddleware())
    .use(
      validateBody(
        t.type({
          startDate: dbDateString,
          endDate: dbDateString,
          includeDrafts: t.union([
            t.literal('include'),
            t.literal('exclude'),
            t.literal('only-drafts'),
          ]),
          groupBy: t.union([t.null, t.literal('payer'), t.literal('center')]),
          centers: t.union([t.null, t.array(t.string)]),
        }),
      ),
    )
    .handler(async ctx => {
      /*const report = await */ bus.exec(debtService.generateDebtLedger, {
        options: {
          startDate: parse(ctx.body.startDate, 'yyyy-MM-dd', new Date()),
          endDate: parse(ctx.body.endDate, 'yyyy-MM-dd', new Date()),
          includeDrafts: ctx.body.includeDrafts,
          groupBy: ctx.body.groupBy,
          centers: ctx.body.centers,
        },
        generatedBy: ctx.session.payerId,
        parent: null,
      });

      return ok();
      //return ok(report);
    });

  const generatePaymentLedgerReport = route
    .post('/generate/payment-ledger')
    .use(auth.createAuthMiddleware())
    .use(
      validateBody(
        t.type({
          startDate: dbDateString,
          endDate: dbDateString,
          paymentType: t.union([
            t.null,
            t.literal('cash'),
            t.literal('invoice'),
          ]),
          centers: t.union([t.null, t.array(t.string)]),
          groupBy: t.union([t.null, t.literal('payer'), t.literal('center')]),
          eventTypes: t.union([
            t.null,
            t.array(
              t.union([
                t.literal('payment'),
                t.literal('created'),
                t.literal('credited'),
              ]),
            ),
          ]),
        }),
      ),
    )
    .handler(async ctx => {
      /*const report = await */ bus.exec(paymentService.generatePaymentLedger, {
        options: {
          startDate: parse(ctx.body.startDate, 'yyyy-MM-dd', new Date()),
          endDate: parse(ctx.body.endDate, 'yyyy-MM-dd', new Date()),
          paymentType: ctx.body.paymentType,
          centers: ctx.body.centers,
          groupBy: ctx.body.groupBy,
          eventTypes: ctx.body.eventTypes,
        },
        generatedBy: ctx.session.payerId,
        parent: null,
      });

      return ok();
      // return ok(report);
    });

  const generateDebtStatusReport = route
    .post('/generate/debt-status-report')
    .use(auth.createAuthMiddleware())
    .use(
      validateBody(
        t.type({
          date: dbDateString,
          groupBy: t.union([t.null, t.literal('payer'), t.literal('center')]),
          centers: t.union([t.null, t.array(t.string)]),
          includeOnly: t.union([
            t.null,
            t.literal('paid'),
            t.literal('credited'),
            t.literal('open'),
          ]),
        }),
      ),
    )
    .handler(async ctx => {
      /*const report = await */ bus.exec(debtService.generateDebtStatusReport, {
        options: {
          date: parse(ctx.body.date, 'yyyy-MM-dd', new Date()),
          centers: ctx.body.centers,
          groupBy: ctx.body.groupBy,
          includeOnly: ctx.body.includeOnly,
        },
        generatedBy: ctx.session.payerId,
        parent: null,
      });

      return ok();
      //return ok(report);
    });

  const refreshReport = route
    .post('/:id/refresh')
    .use(auth.createAuthMiddleware())
    .handler(async ctx => {
      const report = await bus.exec(reportService.refreshReport, {
        reportId: ctx.routeParams.id,
        generatedBy: ctx.session.payerId,
      });

      if (!report) {
        return notFound({
          message: 'Report could not be refreshed.',
        });
      }

      return ok(report);
    });

  return router(
    getReport,
    getReports,
    getReportContent,
    generateDebtLedgerReport,
    generatePaymentLedgerReport,
    generateDebtStatusReport,
    refreshReport,
  );
};
