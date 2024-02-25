import { createInterface, createScope } from '@/bus';
import * as types from '@bbat/common/build/src/types';
import * as t from 'io-ts';

const scope = createScope('banking');

export const onTransaction = scope.defineEvent(
  'onTransaction',
  types.bankTransaction,
);

const iface = createInterface('banking', builder => ({
  createBankAccount: builder.proc({
    payload: types.bankAccount,
    response: types.bankAccount,
  }),

  getBankAccounts: builder.proc({
    payload: t.void,
    response: t.array(types.bankAccount),
  }),

  getBankAccount: builder.proc({
    payload: t.string,
    response: t.union([types.bankAccount, t.null]),
  }),

  createBankStatement: builder.proc({
    payload: types.newBankStatement,
    response: t.type({
      statement: types.bankStatement,
      transactions: t.array(types.bankTransaction),
    }),
  }),

  /*assignTransactionsToPaymentByReferenceNumber: builder.proc({
    payload: t.type({
      paymentId: t.string,
      referenceNumber: t.string,
    }),
    response: t.void,
  }),*/

  getTransactionsWithoutRegistration: builder.proc({
    payload: t.void,
    response: t.array(types.bankTransaction),
  }),

  getAccountTransactions: builder.proc({
    payload: t.string,
    response: t.array(types.bankTransaction),
  }),

  getTransactionsByReference: builder.proc({
    payload: t.string,
    response: t.array(types.bankTransaction),
  }),

  getTransaction: builder.proc({
    payload: t.string,
    response: t.union([t.null, types.bankTransaction]),
  }),

  getTransactionRegistrations: builder.proc({
    payload: t.string,
    response: t.array(types.paymentEvent),
  }),

  getAccountStatements: builder.proc({
    payload: t.string,
    response: t.array(types.bankStatement),
  }),

  getBankStatement: builder.proc({
    payload: t.string,
    response: t.union([t.null, types.bankStatement]),
  }),

  getBankStatementTransactions: builder.proc({
    payload: t.string,
    response: t.array(types.bankTransaction),
  }),
}));

export default iface;

export const {
  createBankAccount,
  getBankAccount,
  getBankAccounts,
  getBankStatementTransactions,
  createBankStatement,
  // assignTransactionsToPaymentByReferenceNumber
  getTransactionsWithoutRegistration,
  getAccountTransactions,
  getTransactionsByReference,
  getTransaction,
  getTransactionRegistrations,
  getAccountStatements,
  getBankStatement,
} = iface.procedures;
