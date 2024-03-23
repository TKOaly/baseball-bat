import { router } from 'typera-express';
import { notFound, ok } from 'typera-express/response';
import { dbDateString } from '@bbat/common/build/src/types';
import { validateBody } from '@/validate-middleware';
import * as t from 'io-ts';
import { parse } from 'date-fns';
import * as reportService from '@/modules/reports/definitions';
import * as debtService from '@/modules/debts/definitions';
import * as paymentService from '@/modules/payments/definitions';
import auth from '@/auth-middleware';
import { RouterFactory } from '@/module';

const factory: RouterFactory = route => {
  const getReport = route
    .get('/:id')
    .use(auth())
    .handler(async ({ bus, ...ctx }) => {
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

  const getReportLink = route
    .get('/:id/link')
    .use(auth())
    .handler(async ({ bus, ...ctx }) => {
      const url = await bus.exec(
        reportService.getReportUrl,
        ctx.routeParams.id,
      );

      if (!url) {
        return notFound();
      }

      return ok({ url });
    });

  const getReports = route
    .get('/')
    .use(auth())
    .handler(async ({ bus }) => {
      const reports = await bus.exec(reportService.getReports);
      return ok(reports);
    });

  const generateDebtLedgerReport = route
    .post('/generate/debt-ledger')
    .use(auth())
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
    .handler(async ({ bus, ...ctx }) => {
      /*const report = await */ bus.exec(debtService.generateDebtLedger, {
        options: {
          startDate: parse(ctx.body.startDate, 'yyyy-MM-dd', new Date()),
          endDate: parse(ctx.body.endDate, 'yyyy-MM-dd', new Date()),
          includeDrafts: ctx.body.includeDrafts,
          groupBy: ctx.body.groupBy,
          centers: ctx.body.centers,
        },
        parent: null,
      });

      return ok();
      //return ok(report);
    });

  const generatePaymentLedgerReport = route
    .post('/generate/payment-ledger')
    .use(auth())
    .use(
      validateBody(
        t.type({
          startDate: dbDateString,
          endDate: dbDateString,
          paymentType: t.union([
            t.null,
            t.literal('cash'),
            t.literal('invoice'),
            t.literal('stripe'),
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
    .handler(async ({ bus, ...ctx }) => {
      /*const report = await */ bus.exec(paymentService.generatePaymentLedger, {
        options: {
          startDate: parse(ctx.body.startDate, 'yyyy-MM-dd', new Date()),
          endDate: parse(ctx.body.endDate, 'yyyy-MM-dd', new Date()),
          paymentType: ctx.body.paymentType,
          centers: ctx.body.centers,
          groupBy: ctx.body.groupBy,
          eventTypes: ctx.body.eventTypes,
        },
        parent: null,
      });

      return ok();
      // return ok(report);
    });

  const generateDebtStatusReport = route
    .post('/generate/debt-status-report')
    .use(auth())
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
    .handler(async ({ bus, ...ctx }) => {
      /*const report = await */ bus.exec(debtService.generateDebtStatusReport, {
        options: {
          date: parse(ctx.body.date, 'yyyy-MM-dd', new Date()),
          centers: ctx.body.centers,
          groupBy: ctx.body.groupBy,
          includeOnly: ctx.body.includeOnly,
        },
        parent: null,
      });

      return ok();
      //return ok(report);
    });

  const refreshReport = route
    .post('/:id/refresh')
    .use(auth())
    .handler(async ({ bus, ...ctx }) => {
      const report = await bus.exec(reportService.refreshReport, {
        reportId: ctx.routeParams.id,
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
    getReportLink,
    generateDebtLedgerReport,
    generatePaymentLedgerReport,
    generateDebtStatusReport,
    refreshReport,
  );
};

export default factory;
