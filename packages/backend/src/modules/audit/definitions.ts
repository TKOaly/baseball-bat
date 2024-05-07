import * as t from 'io-ts';
import * as types from '@bbat/common/types';
import { createInterface } from "@/bus";

const iface = createInterface('audit', (builder) => ({
  logEvent: builder.proc({
    payload: t.intersection([
      t.type({
        type: types.auditEventAction,
      }),
      t.partial({
        details: t.UnknownRecord,
        links: t.array(t.type({
          type: t.string,
          target: t.type({
            type: types.resourceType,
            id: t.string,
          }),
          label: t.string,
        })),
      }),
    ]),
    response: t.void,
  }),

  getLogEvents: builder.proc({
    payload: types.paginationQueryPayload,
    response: types.paginationQueryResponse(types.auditEvent),
  })
}));

export default iface;

export const {
  logEvent,
  getLogEvents,
} = iface.procedures;
