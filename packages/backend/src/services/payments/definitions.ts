import { createScope } from '@/bus';
import { euroValue } from '@bbat/common/currency';
import * as types from '@bbat/common/types';
import * as t from 'io-ts';
import * as tt from 'io-ts-types';

const scope = createScope('payments');

export const createPaymentEventFromTransaction = scope.defineProcedure({
  name: 'createPaymentEventFromTransaction',
  payload: t.type({
    transaction: types.bankTransaction,
    amount: t.union([t.null, euroValue]),
    paymentId: t.union([t.null, t.string]),
  }),
  response: t.union([t.null, types.paymentEvent]),
});

export const getPayments = scope.defineProcedure({
  name: 'getPayments',
  payload: t.void,
  response: t.array(types.payment),
});

export const getPayment = scope.defineProcedure({
  name: 'getPayment',
  payload: t.string,
  response: t.union([t.null, types.payment]),
});

export const getPaymentEvent = scope.defineProcedure({
  name: 'getPaymentEvent',
  payload: t.string,
  response: t.union([t.null, types.paymentEvent]),
});

export const generatePaymentLedger = scope.defineProcedure({
  name: 'generatePaymentLedger',
  payload: t.type({
    options: t.type({
      startDate: tt.date,
      endDate: tt.date,
      centers: t.union([t.null, t.array(t.string)]),
      eventTypes: t.union([
        t.null,
        t.array(
          t.union([
            t.literal('credited'),
            t.literal('created'),
            t.literal('payment'),
          ]),
        ),
      ]),
      groupBy: t.union([t.null, t.string]),
      paymentType: t.union([t.null, t.string]),
    }),
    generatedBy: types.internalIdentityT,
    parent: t.union([t.null, t.string]),
  }),
  response: types.reportWithoutHistory,
});

export const paymentCreationOptions = t.partial({
  sendNotification: t.boolean,
});

export const createInvoice = scope.defineProcedure({
  name: 'createInvoice',
  payload: t.intersection([
    t.type({
      invoice: types.newInvoice,
    }),
    t.partial({
      options: paymentCreationOptions,
    }),
  ]),
  response: types.payment,
});

export const getPaymentsContainingDebt = scope.defineProcedure({
  name: 'getPaymentsContainingDebt',
  payload: t.string,
  response: t.array(types.payment),
});

export const creditPayment = scope.defineProcedure({
  name: 'creditPayment',
  payload: t.type({
    id: t.string,
    reason: t.union([t.null, t.string]),
  }),
  response: t.union([t.null, types.payment]),
});

export const getDefaultInvoicePaymentForDebt = scope.defineProcedure({
  name: 'getDefaultInvoicePaymentForDebt',
  payload: t.string,
  response: t.union([t.null, types.payment]),
});

export const sendNewPaymentNotification = scope.defineProcedure({
  name: 'sendNewPaymentNotification',
  payload: t.string,
  response: tt.either(t.string, types.email),
});

export const createPaymentEvent = scope.defineProcedure({
  name: 'createPaymentEvent',
  payload: t.intersection([
    t.type({
      paymentId: t.string,
      type: t.string,
      amount: euroValue,
      transaction: t.union([t.null, t.string]),
    }),
    t.partial({
      data: t.UnknownRecord,
      time: tt.date,
    }),
  ]),
  response: types.paymentEvent,
});

export const updatePaymentEvent = scope.defineProcedure({
  name: 'updatePaymentEvent',
  payload: t.type({
    id: t.string,
    amount: euroValue,
  }),
  response: t.union([t.null, types.paymentEvent]),
});

export const deletePaymentEvent = scope.defineProcedure({
  name: 'deletePaymentEvent',
  payload: t.string,
  response: t.union([t.null, types.paymentEvent]),
});

export const createStripePayment = scope.defineProcedure({
  name: 'createStripePayment',
  payload: t.type({
    debts: t.array(t.string),
  }),
  response: t.type({
    payment: types.payment,
    clientSecret: t.string,
  }),
});

export const getPayerPayments = scope.defineProcedure({
  name: 'getPayerPayments',
  payload: types.internalIdentityT,
  response: t.array(types.payment),
});

export const createPayment = scope.defineProcedure({
  name: 'createPayment',
  payload: t.intersection([
    t.type({
      payment: t.intersection([
        t.type({
          type: t.string,
          message: t.string,
          title: t.string,
          data: t.UnknownRecord,
          debts: t.array(t.string),
        }),
        t.partial({
          createdAt: tt.date,
          paymentNumber: t.string,
        }),
      ]),
    }),
    t.partial({
      options: t.type({}),
    }),
  ]),
  response: types.payment,
});
