import { parseISO } from 'date-fns/parseISO';
import rtkApi from '../rtk-api';
import { BankStatement, EuroValue } from '@bbat/common/types';

type ResponseBankStatement = Omit<
  BankStatement,
  'generatedAt' | 'closingBalance' | 'openingBalance'
> & {
  generatedAt: string;
  openingBalance: {
    amount: EuroValue;
    date: string;
  };
  closingBalance: {
    amount: EuroValue;
    date: string;
  };
};

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
      transformResponse: (response: ResponseBankStatement[]) =>
        response.map(statement => ({
          ...statement,
          generatedAt: parseISO(statement.generatedAt),
          openingBalance: {
            ...statement.openingBalance,
            date: parseISO(statement.openingBalance.date),
          },
          closingBalance: {
            ...statement.closingBalance,
            date: parseISO(statement.closingBalance.date),
          },
        })),
    }),

    getBankStatement: builder.query<BankStatement, string>({
      query: id => `/banking/statements/${id}`,
      transformResponse: (statement: ResponseBankStatement) => ({
        ...statement,
        generatedAt: parseISO(statement.generatedAt),
        openingBalance: {
          ...statement.openingBalance,
          date: parseISO(statement.openingBalance.date),
        },
        closingBalance: {
          ...statement.closingBalance,
          date: parseISO(statement.closingBalance.date),
        },
      }),
    }),
  }),
});

export const {
  useCreateBankStatementMutation,
  useGetBankAccountStatementsQuery,
  useGetBankStatementQuery,
} = statementsApi;
