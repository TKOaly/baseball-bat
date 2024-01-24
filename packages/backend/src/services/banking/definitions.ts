import { createScope } from "@/bus";
import * as types from "@bbat/common/build/src/types";
import { euroValue } from "@bbat/common/currency";
import * as t from 'io-ts';
import { date } from 'io-ts-types';

const scope = createScope('banking');

export const createBankAccount = scope.defineProcedure({
  name: `createBankAccount`,
  payload: types.bankAccount,
  response: t.void,
});

export const getBankAccount = scope.defineProcedure({
  name: 'getBankAccount',
  payload: t.string,
  response: t.union([types.bankAccount, t.null]),
});

export const getBankAccounts = scope.defineProcedure({
  name: 'getBankAccounts',
  payload: t.void,
  response: t.array(types.bankAccount),
});

export const createBankStatement = scope.defineProcedure({
  name: 'createBankStatement',
  payload: types.newBankStatement,
  response: t.type({
    statement: types.bankStatement,
    transactions: t.array(types.bankTransaction),
  })
});

export const assignTransactionsToPaymentByReferenceNumber = scope.defineProcedure({
  name: 'assignTransactionsToPaymentByReferenceNumber',
  payload: t.type({
    paymentId: t.string,
    referenceNumber: t.string,
  }),
  response: t.void,
});

export const getTransactionsWithoutRegistration = scope.defineProcedure({
  name: 'getTransactionsWithoutRegistration',
  payload: t.void,
  response: t.array(types.bankTransaction),
});

export const getAccountTransactions = scope.defineProcedure({
  name: 'getAccountTransactions',
  payload: t.string,
  response: t.array(types.bankTransaction),
});

export const getTransaction = scope.defineProcedure({
  name: 'getTransaction',
  payload: t.string,
  response: t.union([ t.null, types.bankTransaction ]),
});

export const getTransactionRegistrations = scope.defineProcedure({
  name: 'getTransactionRegistrations',
  payload: t.string,
  response: t.array(types.paymentEvent),
});

export const getAccountStatements = scope.defineProcedure({
  name: 'getAccountStatements',
  payload: t.string,
  response: t.array(types.bankStatement),
});

export const getBankStatement = scope.defineProcedure({
  name: 'getBankStatement',
  payload: t.string,
  response: t.union([ t.null, types.bankStatement ]),
});

export const getBankStatementTransactions = scope.defineProcedure({
  name: 'getBankStatementTransactions',
  payload: t.string,
  response: t.array(types.bankTransaction),
});