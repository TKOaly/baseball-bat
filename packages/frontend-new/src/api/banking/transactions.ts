import { BankTransaction, PaymentEvent } from '@bbat/common/types';
import rtkApi from '../rtk-api';
import { parseISO } from 'date-fns';

const transactionsApi = rtkApi.injectEndpoints({
  endpoints: builder => ({
    importBankTransactions: builder.mutation({
      query: txs => ({
        method: 'POST',
        url: '/banking/transactions/import',
        body: txs,
      }),
      invalidatesTags: [{ type: 'BankTransaction', id: 'LIST' }],
    }),

    getAccountTransactions: builder.query<BankTransaction[], string>({
      query: iban => `/banking/accounts/${iban}/transactions`,
      providesTags: [{ type: 'BankTransaction', id: 'LIST' }],
      transformResponse: (
        response: (Omit<BankTransaction, 'date'> & { date: string })[],
      ) =>
        response.map(tx => ({
          ...tx,
          date: parseISO(tx.date),
        })),
    }),

    getStatementTransactions: builder.query<BankTransaction[], string>({
      query: id => `/banking/statements/${id}/transactions`,
      providesTags: [{ type: 'BankTransaction', id: 'LIST' }],
      transformResponse: (
        response: (Omit<BankTransaction, 'date'> & { date: string })[],
      ) =>
        response.map(tx => ({
          ...tx,
          date: parseISO(tx.date),
        })),
    }),

    autoregister: builder.mutation<void, void>({
      query: () => ({
        url: '/banking/autoregister',
        method: 'POST',
      }),
    }),

    getTransactionRegistrations: builder.query<PaymentEvent[], string>({
      query: id => `/banking/transactions/${id}/registrations`,
      providesTags: response => [
        { type: 'PaymentEvent' as const, id: 'LIST' },
        ...(response ?? []).map(({ id }) => ({
          type: 'PaymentEvent' as const,
          id,
        })),
      ],
    }),
  }),
});

export const {
  useImportBankTransactionsMutation,
  useGetAccountTransactionsQuery,
  useGetStatementTransactionsQuery,
  useAutoregisterMutation,
  useGetTransactionRegistrationsQuery,
} = transactionsApi;

export default transactionsApi;
