import rtkApi from './rtk-api'
import { DebtComponent, NewDebtComponent, Debt, NewDebt, DebtWithPayer } from '../../common/types'

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

    getDebt: builder.query<Debt, string>({
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
  usePublishDebtsMutation
} = debtApi

export default debtApi
