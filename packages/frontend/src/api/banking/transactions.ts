import {
  BankTransaction,
  PaginationQueryResponse,
  PaymentEvent,
} from '@bbat/common/types';
import rtkApi from '../rtk-api';
import { parseISO } from 'date-fns/parseISO';
import { createPaginatedQuery } from '../pagination';

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

    getAccountTransactions: createPaginatedQuery<
      BankTransaction,
      { iban: string }
    >()(builder, {
      query: ({ iban }) => `/banking/accounts/${iban}/transactions`,
      paginationTag: 'BankTransaction',
      transformResponse: (
        response: PaginationQueryResponse<
          Omit<BankTransaction, 'date'> & { date: string }
        >,
      ) => ({
        ...response,
        result: response.result.map(tx => ({
          ...tx,
          date: parseISO(tx.date),
        })),
      }),
    }),

    getStatementTransactions: createPaginatedQuery<
      BankTransaction,
      { id: string }
    >()(builder, {
      query: ({ id }) => `/banking/statements/${id}/transactions`,
      providesTags: [{ type: 'BankTransaction', id: 'LIST' }],
      transformResponse: (
        response: PaginationQueryResponse<
          Omit<BankTransaction, 'date'> & { date: string }
        >,
      ) => ({
        ...response,
        result: response.result.map(tx => ({
          ...tx,
          date: parseISO(tx.date),
        })),
      }),
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
