import { BankTransaction } from '../../../common/types';
import rtkApi from '../rtk-api';

const transactionsApi = rtkApi.injectEndpoints({
  endpoints: builder => ({
    importBankTransactions: builder.mutation({
      query: (txs) => ({
        method: 'POST',
        url: '/banking/transactions/import',
        body: txs,
      }),
      invalidatesTags: [
        { type: 'BankTransaction', id: 'LIST' },
      ],
    }),

    getAccountTransactions: builder.query<BankTransaction[], string>({
      query: (iban) => `/banking/accounts/${iban}/transactions`,
      providesTags: [
        { type: 'BankTransaction', id: 'LIST' },
      ],
    }),

    getStatementTransactions: builder.query<BankTransaction[], string>({
      query: (id) => `/banking/statements/${id}/transactions`,
      providesTags: [
        { type: 'BankTransaction', id: 'LIST' },
      ],
    }),

    autoregister: builder.mutation<void, void>({
      query: () => ({
        url: '/banking/autoregister',
        method: 'POST',
      }),
    })
  }),
});

export const {
  useImportBankTransactionsMutation,
  useGetAccountTransactionsQuery,
  useGetStatementTransactionsQuery,
  useAutoregisterMutation,
} = transactionsApi;

export default transactionsApi;
