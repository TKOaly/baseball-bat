import { createScope } from '@/bus';
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

const scope = createScope('emails');

export const createEmail = scope.defineProcedure({
  name: 'createEmail',
  payload: sendEmailOptions,
  response: types.email,
});

export const sendEmail = scope.defineProcedure({
  name: 'sendEmail',
  payload: t.string,
  response: t.void,
});

export const getEmail = scope.defineProcedure({
  name: 'getEmail',
  payload: t.string,
  response: t.union([t.null, types.email]),
});

export const batchSendEmails = scope.defineProcedure({
  name: 'batchSendEmails',
  payload: t.array(t.string),
  response: t.void,
});

export const sendEmailDirect = scope.defineProcedure({
  name: 'sendEmailDirect',
  payload: sendEmailOptions,
  response: t.void,
});

export const getEmails = scope.defineProcedure({
  name: 'getEmails',
  payload: t.void,
  response: t.array(types.email),
});

export const getEmailsByDebt = scope.defineProcedure({
  name: 'getEmailsByDebt',
  payload: t.string,
  response: t.array(types.email),
});
