import rtkApi from './rtk-api'
import { Debt, DebtComponentDetails, PayerEmail, PayerPreferences, PayerProfile } from '../../common/types'

export type UpdatePayerEmailsQueryPayload = {
  payerId: string,
  emails: PayerEmail[],
}

const payersApi = rtkApi.injectEndpoints({
  endpoints: builder => ({
    getPayer: builder.query<PayerProfile, string>({
      query: (id) => `/payers/${id}`,
    }),

    updatePayerPreferences: builder.mutation<PayerPreferences, { payerId: string, preferences: Partial<PayerPreferences> }>({
      query: ({ payerId, preferences }) => ({
        url: `/payers/${payerId}/preferences`,
        method: 'PATCH',
        body: preferences,
      })
    }),

    updatePayerEmails: builder.mutation<PayerEmail[], UpdatePayerEmailsQueryPayload>({
      query: ({ payerId, emails }) => ({
        url: `/payers/${payerId}/emails`,
        method: 'PATCH',
        body: emails,
      })
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

    getPayerByTkoalyId: builder.query<PayerProfile, number>({
      query: (id) => `/payers/by-tkoaly-id/${id}`,
    }),

    getPayerDebts: builder.query<(Debt & DebtComponentDetails)[], { id: string, includeDrafts?: boolean }>({
      query: ({ id, includeDrafts }) => ({
        url: `/payers/${id}/debts`,
        params: {
          includeDrafts: includeDrafts ? 'true' : 'false',
        }
      }),
    })
  })
})

export const {
  useGetPayerQuery,
  useGetPayerEmailsQuery,
  useGetSessionPayerQuery,
  useGetPayerDebtsQuery,
  useGetPayerByEmailQuery,
  useUpdatePayerPreferencesMutation,
  useUpdatePayerEmailsMutation,
} = payersApi

export default payersApi
