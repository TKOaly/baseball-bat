import { parseISO } from 'date-fns/parseISO';
import rtkApi from './rtk-api';
import { EuroValue, Payment, PaymentEvent } from '@bbat/common/types';
import { createPaginatedQuery } from './pagination';

export type BankTransactionDetails = {
  accountingId: string;
  time: string;
  amount: EuroValue;
  referenceNumber: string;
};

export type UpdatePaymentEventOptions = {
  id: string;
  amount?: EuroValue;
};

const paymentsApi = rtkApi.injectEndpoints({
  endpoints: builder => ({
    getPayments: createPaginatedQuery<Payment>()(builder, {
      query: () => '/payments',
      paginationTag: 'Payment',
    }),

    getPayment: builder.query<Payment, string>({
      query: id => `/payments/${id}`,
      transformResponse: (response: { payment: Payment }) => response.payment,
      providesTags: payment =>
        payment ? [{ type: 'Payment', id: payment.id }] : [],
    }),

    getOwnPayments: builder.query<Payment[], void>({
      query: () => '/payments/my',
      providesTags: [{ type: 'Payment', id: 'LIST' }],
      transformResponse: (
        response: (Omit<Payment, 'paidAt'> & { paidAt: string })[],
      ) =>
        response.map(payment => ({
          ...payment,
          paidAt: payment.paidAt ? parseISO(payment.paidAt) : null,
        })),
    }),

    getPaymentsByDebt: createPaginatedQuery<Payment, { debtId: string }>()(
      builder,
      {
        query: ({ debtId }) => `/debt/${debtId}/payments`,
        paginationTag: 'Payment',
      },
    ),

    createInvoice: builder.mutation<
      Payment,
      { debts: string[]; sendEmail: boolean }
    >({
      query: payload => ({
        url: '/payments/create-invoice',
        method: 'POST',
        body: payload,
      }),
    }),

    createStripePayment: builder.mutation<Payment, { debts: string[] }>({
      query: payload => ({
        url: '/payments/create-stripe-payment',
        method: 'POST',
        body: payload,
      }),
    }),

    creditPayment: builder.mutation<void, string>({
      query: id => ({
        method: 'POST',
        url: `/payments/${id}/credit`,
      }),
    }),

    getPaymentsByReferenceNumbers: builder.query<Payment[], string[]>({
      query: rfs => ({
        method: 'POST',
        url: '/payments/by-reference-numbers',
        body: rfs,
      }),
      providesTags: [{ type: 'Payment', id: 'LIST' }],
    }),

    deletePaymentEvent: builder.mutation<PaymentEvent, string>({
      query: id => ({
        url: `/payments/events/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: payment =>
        payment
          ? [
              { type: 'BankTransaction', id: 'LIST' },
              { type: 'PaymentEvent', id: payment.id },
              { type: 'PaymentEvent', id: 'LIST' },
            ]
          : [],
    }),

    updatePaymentEvent: builder.mutation<
      PaymentEvent,
      UpdatePaymentEventOptions
    >({
      query: ({ id, amount }) => ({
        url: `/payments/events/${id}`,
        method: 'PATCH',
        body: { amount },
      }),
      invalidatesTags: payment =>
        payment ? [{ type: 'PaymentEvent', id: payment.id }] : [],
    }),

    registerTransaction: builder.mutation<
      void,
      { paymentId: string; transactionId: string; amount: EuroValue }
    >({
      query: ({ paymentId, transactionId, amount }) => ({
        method: 'POST',
        url: `/payments/${paymentId}/register`,
        body: { transactionId, amount },
      }),
      invalidatesTags: (_, __, { paymentId, transactionId }) => [
        { type: 'PaymentEvent' as const, id: 'LIST' },
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
  useDeletePaymentEventMutation,
  useUpdatePaymentEventMutation,
} = paymentsApi;

export default paymentsApi;
