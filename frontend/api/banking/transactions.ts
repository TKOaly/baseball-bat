import { BankTransaction } from '../../../common/types'
import rtkApi from '../rtk-api'

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
      ]
    }),

    getAccountTransactions: builder.query<BankTransaction[], string>({
      query: (iban) => `/banking/accounts/${iban}/transactions`,
    }),

    getStatementTransactions: builder.query<BankTransaction[], string>({
      query: (id) => `/banking/statements/${id}/transactions`,
    }),
  })
})

export const {
  useImportBankTransactionsMutation,
  useGetAccountTransactionsQuery,
  useGetStatementTransactionsQuery,
} = transactionsApi
