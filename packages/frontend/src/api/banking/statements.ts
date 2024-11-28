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
    createBankStatement: builder.mutation<{ job: string }, File>({
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

    getInfo: builder.query<{ latestBankInfo: Date | null }, void>({
      query: () => '/banking/info',
      transformResponse: (response: { latestBankInfo: string | null }) => ({
        latestBankInfo: response.latestBankInfo
          ? parseISO(response.latestBankInfo)
          : null,
      }),
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

    getStatementLink: builder.query<{ url: string }, string>({
      query: id => `/banking/statements/${id}/link`,
    }),
  }),
});

export const {
  useCreateBankStatementMutation,
  useGetBankAccountStatementsQuery,
  useGetBankStatementQuery,
  useGetInfoQuery,
  useGetStatementLinkQuery,
} = statementsApi;

export default statementsApi;
