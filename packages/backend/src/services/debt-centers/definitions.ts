import { createScope } from '@/bus';
import * as t from 'io-ts';
import * as tt from 'io-ts-types';
import * as types from '@bbat/common/types';

const scope = createScope('debt-centers');

export const getDebtCenter = scope.defineProcedure({
  name: 'getDebtCenter',
  payload: t.string,
  response: t.union([t.null, types.debtCenter]),
});

export const getDebtCenterByName = scope.defineProcedure({
  name: 'getDebtCenterByName',
  payload: t.string,
  response: t.union([t.null, types.debtCenter]),
});

export const createDebtCenter = scope.defineProcedure({
  name: 'createDebtCenter',
  payload: t.type({
    name: t.string,
    accountingPeriod: t.number,
    description: t.string,
    url: t.string,
  }),
  response: types.debtCenter,
});

export const getDebtCenters = scope.defineProcedure({
  name: 'getDebtCenters',
  payload: t.void,
  response: t.array(types.debtCenter),
});

export const deleteDebtCenter = scope.defineProcedure({
  name: 'deleteDebtCenter',
  payload: t.string,
  response: t.union([t.null, types.debtCenter]),
});

export const updateDebtCenter = scope.defineProcedure({
  name: 'updateDebtCenter',
  payload: types.debtCenterPatch,
  response: tt.either(t.unknown, types.debtCenter),
});
