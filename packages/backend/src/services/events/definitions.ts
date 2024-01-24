import { createScope } from '@/bus';
import * as t from 'io-ts';
import * as tt from 'io-ts-types';
import * as types from '@bbat/common/types';

const scope = createScope('events');

export const getEventRegistrations = scope.defineProcedure({
  name: 'getEventRegistrations',
  payload: t.number,
  response: t.array(types.registration),
});

export const getEventCustomFields = scope.defineProcedure({
  name: 'getEventCustomFields',
  payload: t.number,
  response: t.array(types.customField),
});

export const getEvents = scope.defineProcedure({
  name: 'getEvents',
  payload: t.type({
    starting: tt.date,
  }),
  response: t.array(types.event),
});

export const getUserEvents = scope.defineProcedure({
  name: 'getUserEvents',
  payload: types.tkoalyIdentityT,
  response: t.array(types.event),
});
