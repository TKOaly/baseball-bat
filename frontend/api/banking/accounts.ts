import rtkApi from '../rtk-api'

const accountsApi = rtkApi.injectEndpoints({
  endpoints: builder => ({
    getBankAccounts: builder.query<BankAccount, void>({
      query: () => '/banking/accounts',
      providesTags: [
        { type: 'BankAccount', id: 'LIST' },
      ]
    }),

    createBankAccount: builder.mutation<BankAccount, BankAccount>({
      query: (account) => ({
        method: 'POST',
        url: '/banking/accounts',
        body: account,
      }),
      invalidatesTags: (account) => [
        { type: 'BankAccount', id: 'LIST' },
      ],
    })
  }),
});

export const {
  useGetBankAccountsQuery,
  useCreateBankAccountMutation,
} = accountsApi
