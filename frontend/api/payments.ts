import rtkApi from './rtk-api'
import { Payment } from '../../common/types'

const paymentsApi = rtkApi.injectEndpoints({
  endpoints: builder => ({
    getPayments: builder.query<Payment[], never>({
      query: () => '/payments',
    }),

    getPayment: builder.query<Payment, string>({
      query: (id) => `/payments/${id}`,
      transformResponse: (response) => response.payment,
    }),

    getOwnPayments: builder.query<Payment[], never>({
      query: () => '/payments/my'
    }),

    getPaymentsByDebt: builder.query<Payment[], string>({
      query: (id) => `/debt/${id}/payments`
    }),

    createInvoice: builder.mutation<Payment, { debts: string[] }>({
      query: (payload) => ({
        url: '/payments/create-invoice',
        method: 'POST',
        body: payload,
      }),
    })
  })
});

export const {
  useGetPaymentsQuery,
  useGetOwnPaymentsQuery,
  useGetPaymentQuery,
  useGetPaymentsByDebtQuery,
  useCreateInvoiceMutation,
} = paymentsApi
