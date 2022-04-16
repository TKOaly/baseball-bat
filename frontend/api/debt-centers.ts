import rootApi from './rtk-api'
import { DebtCenter, NewDebtCenter } from '../../common/types'

const debtCentersApi = rootApi.injectEndpoints({
  endpoints: (builder) => ({
    getDebtCenters: builder.query<DebtCenter[], null>({
      query: () => '/debtCenters',
    }),

    getDebtCenter: builder.query<DebtCenter, string>({
      query: (id) => `/debtCenters/${id}`,
    }),

    createDebtCenter: builder.mutation({
      query: (debtCenter: NewDebtCenter) => ({
        url: '/debtCenters',
        method: 'POST',
        body: debtCenter,
      }),
    }),

    createDebtCenterFromEvent: builder.mutation<DebtCenter, { events: number[], settings: any }>({
      query: (payload) => ({
        url: '/debtCenters/fromEvent',
        method: 'POST',
        body: payload,
      })
    })
  }),
});

export const {
  useGetDebtCentersQuery,
  useGetDebtCenterQuery,
  useCreateDebtCenterMutation,
  useCreateDebtCenterFromEventMutation
} = debtCentersApi

export default debtCentersApi
