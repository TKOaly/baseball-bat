import { createInterface } from '@/bus';
import * as t from 'io-ts';

const iface = createInterface('accounting', builder => ({
  getAccountingPeriods: builder.proc({
    payload: t.void,
    response: t.array(
      t.type({
        year: t.number,
        closed: t.boolean,
      }),
    ),
  }),

  isAccountingPeriodOpen: builder.proc({
    payload: t.number,
    response: t.boolean,
  }),
}));

export default iface;

export const { getAccountingPeriods, isAccountingPeriodOpen } =
  iface.procedures;
