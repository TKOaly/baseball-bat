import rtkApi from './rtk-api';
import { EuroValue, Payment } from '../../common/types';

export type BankTransactionDetails = {
  accountingId: string
  time: string
  amount: EuroValue
  referenceNumber: string
}

const paymentsApi = rtkApi.injectEndpoints({
  endpoints: builder => ({
    getPayments: builder.query<Payment[], never>({
      query: () => '/payments',
      providesTags: [
        { type: 'Payment', id: 'LIST' },
      ],
    }),

    getPayment: builder.query<Payment, string>({
      query: (id) => `/payments/${id}`,
      transformResponse: (response) => response.payment,
      providesTags: ({ id }) => [{ type: 'Payment', id }],
    }),

    getOwnPayments: builder.query<Payment[], void>({
      query: () => '/payments/my',
      providesTags: [
        { type: 'Payment', id: 'LIST' },
      ],
    }),

    getPaymentsByDebt: builder.query<Payment[], string>({
      query: (id) => `/debt/${id}/payments`,
      providesTags: [
        { type: 'Payment', id: 'LIST' },
      ],
    }),

    createInvoice: builder.mutation<Payment, { debts: string[], sendEmail: boolean }>({
      query: (payload) => ({
        url: '/payments/create-invoice',
        method: 'POST',
        body: payload,
      }),
    }),

    createStripePayment: builder.mutation<{ payment: Payment, clientSecret: string }, { debts: string[] }>({
      query: (payload) => ({
        url: '/payments/create-stripe-payment',
        method: 'POST',
        body: payload,
      }),
    }),

    creditPayment: builder.mutation<void, string>({
      query: (id) => ({
        method: 'POST',
        url: `/payments/${id}/credit`,
      }),
    }),

    getPaymentsByReferenceNumbers: builder.query<Payment[], string[]>({
      query: (rfs) => ({
        method: 'POST',
        url: '/payments/by-reference-numbers',
        body: rfs,
      }),
      providesTags: [
        { type: 'Payment', id: 'LIST' },
      ],
    }),

    registerTransaction: builder.mutation<void, { paymentId: string, transactionId: string }>({
      query: ({ paymentId, transactionId }) => ({
        method: 'POST',
        url: `/payments/${paymentId}/register`,
        body: { transactionId },
      }),
      invalidatesTags: (_, __, { paymentId, transactionId }) => [
        { type: 'BankTransaction', id: 'LIST' },
        { type: 'BankTransaction', id: transactionId },
        { type: 'Payment', id: paymentId },
        { type: 'Payment', id: 'LIST' },
      ],
    }),
  }),
});

export const {
  useGetPaymentsQuery,
  useGetOwnPaymentsQuery,
  useGetPaymentQuery,
  useGetPaymentsByDebtQuery,
  useCreateInvoiceMutation,
  useCreditPaymentMutation,
  useGetPaymentsByReferenceNumbersQuery,
  useRegisterTransactionMutation,
  useCreateStripePaymentMutation,
} = paymentsApi;

export default paymentsApi;
