import rtkApi from '../rtk-api';
import { BankStatement } from '../../../common/types';

const statementsApi = rtkApi.injectEndpoints({
  endpoints: builder => ({
    createBankStatement: builder.mutation<BankStatement, File>({
      query: file => {
        const body = new FormData();

        body.append('statement', file);

        return {
          method: 'POST',
          url: '/banking/statements',
          body,
        };
      },
    }),

    getBankAccountStatements: builder.query<BankStatement[], string>({
      query: iban => `/banking/accounts/${iban}/statements`,
    }),

    getBankStatement: builder.query<BankStatement, string>({
      query: id => `/banking/statements/${id}`,
    }),
  }),
});

export const {
  useCreateBankStatementMutation,
  useGetBankAccountStatementsQuery,
  useGetBankStatementQuery,
} = statementsApi;
