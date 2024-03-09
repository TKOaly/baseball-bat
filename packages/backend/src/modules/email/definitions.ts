import { createInterface } from '@/bus';
import * as t from 'io-ts';
import * as types from '@bbat/common/types';

export const sendEmailOptions = t.intersection([
  t.type({
    template: t.string,
    recipient: t.string,
    subject: t.string,
    payload: t.UnknownRecord,
  }),
  t.partial({
    debts: t.array(t.string),
  }),
]);

const iface = createInterface('email', builder => ({
  createEmail: builder.proc({
    payload: sendEmailOptions,
    response: types.email,
  }),
  sendEmail: builder.proc({
    payload: t.string,
    response: t.void,
  }),
  getEmail: builder.proc({
    payload: t.string,
    response: t.union([t.null, types.email]),
  }),
  batchSendEmails: builder.proc({
    payload: t.array(t.string),
    response: t.void,
  }),
  sendEmailDirect: builder.proc({
    payload: sendEmailOptions,
    response: t.void,
  }),
  getEmails: builder.proc({
    payload: types.paginationQueryPayload,
    response: types.paginationQueryResponse(types.email),
  }),
  getEmailsByDebt: builder.proc({
    payload: t.intersection([
      t.type({ debtId: t.string }),
      types.paginationQueryPayload,
    ]),
    response: types.paginationQueryResponse(types.email),
  }),
}));

export const {
  createEmail,
  sendEmail,
  getEmail,
  batchSendEmails,
  sendEmailDirect,
  getEmails,
  getEmailsByDebt,
} = iface.procedures;

export default iface;
