import { BankAccount } from '../../../common/types';
import rtkApi from '../rtk-api';

const accountsApi = rtkApi.injectEndpoints({
  endpoints: builder => ({
    getBankAccounts: builder.query<BankAccount[], void>({
      query: () => '/banking/accounts',
      providesTags: [{ type: 'BankAccount', id: 'LIST' }],
    }),

    getBankAccount: builder.query<BankAccount, string>({
      query: iban => `/banking/accounts/${iban}`,
      providesTags: ({ iban }) => [{ type: 'BankAccount', id: iban }],
    }),

    createBankAccount: builder.mutation<BankAccount, BankAccount>({
      query: account => ({
        method: 'POST',
        url: '/banking/accounts',
        body: account,
      }),
      invalidatesTags: () => [{ type: 'BankAccount', id: 'LIST' }],
    }),
  }),
});

export const {
  useGetBankAccountsQuery,
  useGetBankAccountQuery,
  useCreateBankAccountMutation,
} = accountsApi;
