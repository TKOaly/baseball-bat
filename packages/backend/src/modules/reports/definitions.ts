import { createInterface, createScope, defineEvent } from '@/bus';
import * as types from '@bbat/common/types';
import * as t from 'io-ts';

const scope = createScope('reports');

export const createReport = scope.defineProcedure({
  name: 'createReport',
  payload: t.intersection([
    t.type({
      template: t.string,
      name: t.string,
      options: t.unknown,
    }),
    t.partial({
      scale: t.number,
      parent: t.string,
    }),
  ]),
  response: types.reportWithoutHistory,
});

export const getReport = scope.defineProcedure({
  name: 'getReport',
  payload: t.string,
  response: t.union([t.null, types.report]),
});

export const getReports = scope.defineProcedure({
  name: 'getReports',
  payload: t.void,
  response: t.array(types.report),
});

export const getReportContent = scope.defineProcedure({
  name: 'getReportContent',
  payload: t.string,
  response: t.union([t.null, t.string]),
});

export const refreshReport = scope.defineProcedure({
  name: 'refreshReport',
  payload: t.type({
    reportId: t.string,
  }),
  response: types.reportWithoutHistory,
});

export const reportTypeIface = createInterface('reportType', builder => ({
  getDetails: builder.proc({
    payload: t.void,
    response: t.intersection([
      t.type({
        template: t.string,
      }),
      t.partial({
        scale: t.number,
      }),
    ]),
  }),

  generate: builder.proc({
    payload: t.type({
      options: t.unknown,
    }),
    response: t.unknown,
  }),
}));

export const onReportStatusChanged = defineEvent(
  'reports:reportStatusChanged',
  t.type({
    report: t.string,
    status: types.reportStatus,
  }),
);
