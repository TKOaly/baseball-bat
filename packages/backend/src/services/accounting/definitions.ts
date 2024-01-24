import { createScope } from "@/bus";
import * as t from 'io-ts';

const scope = createScope('accounting');

export const getAccountingPeriods = scope.defineProcedure({
  name: 'getAccountingPeriods',
  payload: t.void,
  response: t.array(t.type({
    year: t.number,
    closed: t.boolean,
  })),
});

export const isAccountingPeriodOpen = scope.defineProcedure({
  name: 'isAccountingPeriodOpen',
  payload: t.number,
  response: t.boolean,
});

