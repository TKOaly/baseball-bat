import rtkApi from './rtk-api'
import { Debt, DebtComponentDetails, PayerEmail, PayerProfile } from '../../common/types'

const payersApi = rtkApi.injectEndpoints({
  endpoints: builder => ({
    getPayer: builder.query<PayerProfile, string>({
      query: (id) => `/payers/${id}`,
    }),

    getPayerByEmail: builder.query<PayerProfile, string>({
      query: (email) => `/payers/by-email/${encodeURIComponent(email)}`,
    }),

    getPayerEmails: builder.query<PayerEmail[], string>({
      query: (id) => `/payers/${id}/emails`,
    }),

    getSessionPayer: builder.query<PayerProfile, never>({
      query: () => '/payers/session',
    }),

    getPayerDebts: builder.query<(Debt & DebtComponentDetails)[], string>({
      query: (id) => `/payers/${id}/debts`,
    })
  })
})

export const {
  useGetPayerQuery,
  useGetPayerEmailsQuery,
  useGetSessionPayerQuery,
  useGetPayerDebtsQuery,
  useGetPayerByEmailQuery,
} = payersApi
