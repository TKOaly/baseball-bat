import { createScope } from '@/bus';
import * as types from '@bbat/common/types';
import * as t from 'io-ts';

const scope = createScope('reports');

export const createReport = scope.defineProcedure({
  name: 'createReport',
  payload: t.intersection([
    t.type({
      template: t.string,
      name: t.string,
      payload: t.unknown,
      options: t.unknown,
      generatedBy: types.internalIdentityT,
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
  name: 'getReport',
  payload: t.string,
  response: t.union([t.null, t.string]),
});

export const refreshReport = scope.defineProcedure({
  name: 'refreshReport',
  payload: t.type({
    reportId: t.string,
    generatedBy: types.internalIdentityT,
  }),
  response: types.reportWithoutHistory,
});
