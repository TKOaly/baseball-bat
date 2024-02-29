import { createInterface } from '@/bus';
import * as t from 'io-ts';
import * as tt from 'io-ts-types';
import * as types from '@bbat/common/types';

const iface = createInterface('debt-centers', builder => ({
  getDebtCenter: builder.proc({
    payload: t.string,
    response: t.union([t.null, types.debtCenter]),
  }),

  getDebtCenterByName: builder.proc({
    payload: t.string,
    response: t.union([t.null, types.debtCenter]),
  }),

  createDebtCenter: builder.proc({
    payload: t.type({
      name: t.string,
      accountingPeriod: t.number,
      description: t.string,
      url: t.string,
    }),
    response: types.debtCenter,
  }),

  getDebtCenters: builder.proc({
    payload: t.void,
    response: t.array(types.debtCenter),
  }),

  deleteDebtCenter: builder.proc({
    payload: t.string,
    response: t.union([t.null, types.debtCenter]),
  }),

  updateDebtCenter: builder.proc({
    payload: types.debtCenterPatch,
    response: tt.either(t.unknown, types.debtCenter),
  }),
}));

export default iface;

export const {
  getDebtCenter,
  getDebtCenterByName,
  createDebtCenter,
  getDebtCenters,
  deleteDebtCenter,
  updateDebtCenter,
} = iface.procedures;
