import { createInterface } from '@/bus';
import * as t from 'io-ts';
import * as tt from 'io-ts-types';
import * as types from '@bbat/common/types';

const iface = createInterface('events', builder => ({
  getEventRegistrations: builder.proc({
    payload: t.number,
    response: t.array(types.registration),
  }),
  getEventCustomFields: builder.proc({
    payload: t.number,
    response: t.array(types.customField),
  }),
  getEvents: builder.proc({
    payload: t.type({
      starting: tt.date,
    }),
    response: t.array(types.event),
  }),
  getUserEvents: builder.proc({
    payload: types.tkoalyIdentityT,
    response: t.array(types.event),
  }),
}));

export default iface;

export const {
  getEventRegistrations,
  getEventCustomFields,
  getEvents,
  getUserEvents,
} = iface.procedures;
