import rtkApi from './rtk-api'
import { DebtComponent, NewDebtComponent, Debt, NewDebt, DebtWithPayer, Payment, Email, DebtPatch } from '../../common/types'
import { omit } from 'remeda';

export type DebtResponse = DebtWithPayer & {
  debtComponents: Array<DebtComponent>,
}

const debtApi = rtkApi.injectEndpoints({
  endpoints: builder => ({
    createDebtComponent: builder.mutation<DebtComponent, NewDebtComponent>({
      query: (debtComponent) => ({
        method: 'POST',
        url: '/debt/component',
        body: debtComponent,
      }),
    }),

    createDebt: builder.mutation<Debt, NewDebt>({
      query: (debt) => ({
        method: 'POST',
        url: '/debt',
        body: debt,
      }),
      invalidatesTags: () => [{ type: 'Debt', id: 'LIST' }],
    }),

    getDebtComponents: builder.query<DebtComponent, never>({
      query: () => '/debtComponent',
    }),

    getDebtComponentsByCenter: builder.query<DebtComponent[], string>({
      query: (id) => `/debtCenters/${id}/components`,
    }),

    getDebtsByCenter: builder.query<DebtWithPayer[], string>({
      query: (id) => `/debtCenters/${id}/debts`,
      providesTags: (result) => [
        { type: 'Debt' as const, id: 'LIST' },
        ...result.map(debt => ({ type: 'Debt' as const, id: debt.id })),
      ]
    }),

    getDebt: builder.query<DebtResponse, string>({
      query: (id) => `/debt/${id}`,
      providesTags: (result) => [{ type: 'Debt', id: result.id }],
    }),

    getDebts: builder.query<DebtWithPayer[], never>({
      query: () => `/debt`,
      providesTags: (result) => [
        { type: 'Debt' as const, id: 'LIST' },
        ...result.map(debt => ({ type: 'Debt' as const, id: debt.id })),
      ]
    }),

    getDebtsByPayment: builder.query<DebtWithPayer[], string>({
      query: (id) => `/debt/by-payment/${id}`,
      providesTags: (result) => [
        { type: 'Debt' as const, id: 'LIST' },
        ...result.map(debt => ({ type: 'Debt' as const, id: debt.id })),
      ]
    }),

    publishDebts: builder.mutation<void, string[]>({
      query: (ids) => ({
        method: 'POST',
        url: '/debt/publish',
        body: { ids },
      }),
      invalidatesTags: (_result, _err, ids) => [
        { type: 'Debt' as const, id: 'LIST' },
        { type: 'Email' as const, id: 'LIST' },
        ...ids.map(id => ({ type: 'Debt' as const, id }))
      ]
    }),

    massCreateDebts: builder.mutation<any, any>({
      query: (payload) => ({
        method: 'POST',
        url: '/debt/mass-create',
        body: payload,
      }),
      invalidatesTags: [{ type: 'Debt', id: 'LIST' }],
    }),

    deleteDebt: builder.mutation<void, string>({
      query: (id) => ({
        method: 'DELETE',
        url: `/debt/${id}`
      }),
      invalidatesTags: (_, __, id) => [
        { type: 'Debt', id: 'LIST' },
        { type: 'Debt', id },
      ],
    }),

    creditDebt: builder.mutation<void, string>({
      query: (id) => ({
        method: 'POST',
        url: `/debt/${id}/credit`,
      }),
      invalidatesTags: (_, __, id) => [
        { type: 'Debt', id: 'LIST' },
        { type: 'Debt', id },
      ],
    }),

    markPaidWithCash: builder.mutation<Payment, string>({
      query: (id) => ({
        method: 'POST',
        url: `/debt/${id}/mark-paid-with-cash`,
      }),
      invalidatesTags: (_, __, id) => [
        { type: 'Debt', id: 'LIST' },
        { type: 'Debt', id },
        { type: 'Payment', id: 'LIST' },
      ],
    }),

    sendReminder: builder.mutation<Email, string>({
      query: (id) => ({
        method: 'POST',
        url: `/debt/${id}/send-reminder`,
      }),
      invalidatesTags: [
        { type: 'Email', id: 'LIST' },
      ],
    }),

    sendAllReminders: builder.mutation<{ messageCount: number, payerCount: number }, { ignoreCooldown: boolean, send: boolean }>({
      query: (body) => ({
        method: 'POST',
        url: `/debt/send-reminders`,
        body,
      }),
      invalidatesTags: [
        { type: 'Email', id: 'LIST' },
      ],
    }),

    updateDebt: builder.mutation<Debt, DebtPatch>({
      query: (patch) => ({
        method: 'PUT',
        url: `/debt/${patch.id}`,
        body: omit(patch, ['id']),
      }),
      invalidatesTags: (result) => [
        { type: 'Debt', id: 'LIST' },
        { type: 'Debt', id: result.id },
      ],
    })
  })
});

export const {
  useCreateDebtComponentMutation,
  useCreateDebtMutation,
  useGetDebtComponentsQuery,
  useGetDebtComponentsByCenterQuery,
  useGetDebtsByCenterQuery,
  useGetDebtQuery,
  useGetDebtsQuery,
  usePublishDebtsMutation,
  useMassCreateDebtsMutation,
  useGetDebtsByPaymentQuery,
  useDeleteDebtMutation,
  useCreditDebtMutation,
  useMarkPaidWithCashMutation,
  useSendReminderMutation,
  useSendAllRemindersMutation,
  useUpdateDebtMutation,
} = debtApi

export default debtApi
