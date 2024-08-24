import { createScope, createInterface } from '@/bus';
import { euroValue } from '@bbat/common/currency';
import * as types from '@bbat/common/types';
import * as t from 'io-ts';
import * as tt from 'io-ts-types';

const scope = createScope('payments');

export const onStatusChanged = scope.defineEvent(
  'onStatusChanged',
  t.type({
    paymentId: t.string,
    status: t.union([
      t.literal('paid'),
      t.literal('unpaid'),
      t.literal('mispaid'),
      t.literal('canceled'),
      t.literal('credited')
    ]),
  }),
);

export const onBalanceChanged = scope.defineEvent(
  'onBalanceChanged',
  t.type({
    paymentId: t.string,
    balance: euroValue,
  }),
);

export const onPaymentCreated = scope.defineEvent(
  'onPaymentCreated',
  t.type({
    paymentId: t.string,
  }),
);

export const finalizePayment = scope.defineProcedure({
  name: 'finalizePayment',
  payload: t.string,
  response: t.void,
});

export const getPaymentsByData = scope.defineProcedure({
  name: 'getPaymentsByData',
  payload: t.UnknownRecord,
  response: t.array(types.payment),
});

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
  payload: types.paginationQueryPayload,
  response: types.paginationQueryResponse(types.payment),
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
  payload: t.intersection([
    types.paginationQueryPayload,
    t.type({ debtId: t.string }),
  ]),
  response: types.paginationQueryResponse(types.payment),
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
          amount: euroValue,
        }),
        t.partial({
          createdAt: tt.date,
          paymentNumber: t.string,
        }),
      ]),
    }),
    t.partial({
      defer: t.boolean,
      options: t.unknown,
    }),
  ]),
  response: types.payment,
});

export const paymentTypeIface = createInterface('paymentType', builder => ({
  createPayment: builder.proc({
    payload: t.type({
      paymentId: t.string,
      options: t.unknown,
    }),
    response: t.UnknownRecord,
  }),
}));
