import { createInterface, createScope } from '@/bus';
import * as t from 'io-ts';
import * as tt from 'io-ts-types';
import * as types from '@bbat/common/types';
import { euroValue } from '@bbat/common/currency';

const iface = createInterface('debts', builder => ({
  getDebt: builder.proc({
    payload: t.string,
    response: t.union([t.null, types.debt]),
  }),
  getDebtsByPayment: builder.proc({
    payload: t.string,
    response: t.array(types.debt),
  }),
  onDebtPaid: builder.proc({
    payload: t.type({
      debt: types.debt,
      payment: types.payment,
    }),
    response: t.void,
  }),
  getDebtComponentsByCenter: builder.proc({
    payload: t.string,
    response: t.array(types.debtComponent),
  }),
  generateDebtStatusReport: builder.proc({
    payload: t.type({
      options: t.type({
        date: tt.date,
        centers: t.union([t.null, t.array(t.string)]),
        groupBy: t.union([t.null, t.literal('payer'), t.literal('center')]),
        includeOnly: t.union([
          t.null,
          t.literal('paid'),
          t.literal('credited'),
          t.literal('open'),
        ]),
      }),
      parent: t.union([t.null, t.string]),
    }),
    response: types.reportWithoutHistory,
  }),

  generateDebtLedger: builder.proc({
    payload: t.type({
      options: t.type({
        startDate: tt.date,
        endDate: tt.date,
        centers: t.union([t.null, t.array(t.string)]),
        groupBy: t.union([t.null, t.literal('payer'), t.literal('center')]),
        includeDrafts: t.union([
          t.literal('include'),
          t.literal('exclude'),
          t.literal('only-drafts'),
        ]),
      }),
      parent: t.union([t.null, t.string]),
    }),
    response: types.reportWithoutHistory,
  }),
  getDebtsByCenter: builder.proc({
    payload: t.intersection([
      t.type({ centerId: t.string }),
      types.paginationQueryPayload,
    ]),
    response: types.paginationQueryResponse(types.debt),
  }),
  createDebtComponent: builder.proc({
    payload: t.type({
      name: t.string,
      amount: euroValue,
      description: t.string,
      debtCenterId: t.string,
    }),
    response: types.debtComponent,
  }),
  deleteDebtComponent: builder.proc({
    payload: t.type({
      debtCenterId: t.string,
      debtComponentId: t.string,
    }),
    response: tt.either(
      t.unknown,
      t.type({
        affectedDebts: t.array(t.string),
      }),
    ),
  }),
  createDebt: builder.proc({
    payload: t.intersection([
      t.type({
        debt: t.intersection([
          t.type({
            name: t.string,
            description: t.string,
            centerId: t.string,
            accountingPeriod: t.Int,
            components: t.array(t.string),
            payer: types.identityT,
            tags: t.array(
              t.type({
                name: t.string,
                hidden: t.boolean,
              }),
            ),
          }),
          t.partial({
            dueDate: t.union([t.null, types.dbDateString]),
            date: t.union([t.null, types.dbDateString]),
            paymentCondition: t.union([t.null, t.number]),
            createdAt: types.dbDateString,
            publishedAt: types.dbDateString,
          }),
        ]),
      }),
      t.partial({
        options: t.partial({
          defaultPayment: types.newInvoicePartial,
        }),
      }),
    ]),
    response: types.debt,
  }),
  updateDebtComponent: builder.proc({
    payload: t.type({
      debtCenterId: t.string,
      debtComponentId: t.string,
      debtComponent: types.debtComponentPatch,
    }),
    response: t.union([t.null, types.debtComponent]),
  }),
  getDebtsByPayer: builder.proc({
    payload: t.intersection([
      t.type({
        id: types.internalIdentityT,
        includeDrafts: t.boolean,
        includeCredited: t.boolean,
      }),
      types.paginationQueryPayload,
    ]),
    response: types.paginationQueryResponse(types.debt),
  }),
  createPayment: builder.proc({
    payload: t.intersection([
      t.type({
        debts: t.array(t.string),
        payment: t.intersection([
          t.type({
            type: t.string,
            message: t.string,
            title: t.string,
          }),
          t.partial({
            createdAt: tt.date,
            paymentNumber: t.string,
          }),
        ]),
      }),
      t.partial({
        options: t.unknown,
      }),
    ]),
    response: types.payment,
  }),
  markAsPaid: builder.proc({
    payload: t.type({
      paid: t.boolean,
      debtId: t.string,
    }),
    response: t.void,
  }),
}));

export default iface;

export const {
  getDebt,
  getDebtsByPayment,
  onDebtPaid,
  getDebtComponentsByCenter,
  generateDebtStatusReport,
  generateDebtLedger,
  getDebtsByCenter,
  createDebtComponent,
  deleteDebtComponent,
  createDebt,
  updateDebtComponent,
  getDebtsByPayer,
  createPayment,
  markAsPaid,
} = iface.procedures;

const scope = createScope('debts');

export const sendPaymentRemindersByPayer = scope.defineProcedure({
  name: 'sendPaymentRemindersByPayer',
  payload: t.type({
    payer: types.internalIdentityT,
    send: t.boolean,
    ignoreCooldown: t.boolean,
  }),
  response: t.type({
    messageCount: t.number,
    payerCount: t.number,
    errors: t.array(t.string),
  }),
});

export const getDebtsByEmail = scope.defineProcedure({
  name: 'getDebtsByEmail',
  payload: t.string,
  response: t.array(types.debt),
});

export const sendReminder = scope.defineProcedure({
  name: 'sendReminder',
  payload: t.intersection([
    t.type({
      debtId: t.string,
    }),
    t.partial({
      draft: t.boolean,
    }),
  ]),
  response: tt.either(t.string, types.email),
});

export const sendAllReminders = scope.defineProcedure({
  name: 'sendAllReminders',
  payload: t.partial({
    draft: t.boolean,
    ignoreReminderCooldown: t.boolean,
    debts: t.array(t.string),
  }),
  response: t.type({
    left: t.array(t.string),
    right: t.array(
      t.type({
        email: types.email,
        debtId: t.string,
      }),
    ),
  }),
});

export const getDebts = scope.defineProcedure({
  name: 'getDebts',
  payload: types.paginationQueryPayload,
  response: types.paginationQueryResponse(types.debt),
});

export const getDebtsByTag = scope.defineProcedure({
  name: 'getDebtsByTag',
  payload: t.string,
  response: t.array(types.debt),
});

export const getDebtTotal = scope.defineProcedure({
  name: 'getDebtTotal',
  payload: t.string,
  response: euroValue,
});

export const publishDebt = scope.defineProcedure({
  name: 'publishDebt',
  payload: t.string,
  response: t.void,
});

export const creditDebt = scope.defineProcedure({
  name: 'creditDebt',
  payload: t.string,
  response: t.void,
});

export const deleteDebt = scope.defineProcedure({
  name: 'deleteDebt',
  payload: t.string,
  response: t.void,
});

export const batchCreateDebts = scope.defineProcedure({
  name: 'batchCreateDebt',
  payload: t.type({
    debts: t.array(
      t.partial({
        tkoalyUserId: types.tkoalyIdentityT,
        debtCenter: t.string,
        title: t.string,
        description: t.string,
        email: t.string,
        date: types.dateString,
        amount: euroValue,
        dueDate: types.dateString,
        publishedAt: types.dateString,
        paymentCondition: t.number,
        components: t.array(t.string),
        paymentNumber: t.string,
        referenceNumber: t.string,
        tags: t.array(t.string),
        accountingPeriod: t.number,
      }),
    ),
    components: t.array(
      t.type({
        name: t.string,
        amount: euroValue,
      }),
    ),
    token: t.string,
    dryRun: t.boolean,
  }),
  response: t.string,
});

export const updateDebt = scope.defineProcedure({
  name: 'updateDebt',
  payload: types.debtPatch,
  response: tt.either(t.unknown, types.debt),
});

export const createCombinedPayment = scope.defineProcedure({
  name: 'createCombinedPayment',
  payload: t.type({
    debts: t.array(t.string),
    options: t.UnknownRecord,
    type: t.string,
  }),
  response: types.payment,
});

export const onDebtCreated = scope.defineEvent(
  'onDebtCreated',
  t.type({
    debtId: t.string,
  }),
);

export const onStatusChanged = scope.defineEvent(
  'onStatusChanged',
  t.type({
    debtId: t.string,
    status: t.union([
      t.literal('paid'),
      t.literal('unpaid'),
      t.literal('mispaid'),
      t.literal('credited'),
    ]),
  })
);
