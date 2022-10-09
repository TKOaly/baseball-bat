import rtkApi from './rtk-api'
import { Debt, DebtComponentDetails, PayerEmail, PayerPreferences, PayerProfile } from '../../common/types'

export type UpdatePayerEmailsQueryPayload = {
  payerId: string,
  emails: PayerEmail[],
}

const payersApi = rtkApi.injectEndpoints({
  endpoints: builder => ({
    getPayers: builder.query<PayerProfile[], never>({
      query: () => '/payers',
      providesTags: [
        { type: 'Payer', id: 'LIST' },
      ],
    }),

    getPayer: builder.query<PayerProfile, string>({
      query: (id) => `/payers/${id}`,
      providesTags: ({ id }) => [
        { type: 'Payer', id: id.value },
      ]
    }),

    updatePayerPreferences: builder.mutation<PayerPreferences, { payerId: string, preferences: Partial<PayerPreferences> }>({
      query: ({ payerId, preferences }) => ({
        url: `/payers/${payerId}/preferences`,
        method: 'PATCH',
        body: preferences,
      }),
      invalidatesTags: (_, __, { payerId }) => [
        { type: 'Payer', id: payerId },
      ]
    }),

    updatePayerEmails: builder.mutation<PayerEmail[], UpdatePayerEmailsQueryPayload>({
      query: ({ payerId, emails }) => ({
        url: `/payers/${payerId}/emails`,
        method: 'PATCH',
        body: emails,
      }),
      invalidatesTags: (_, __, { payerId }) => [
        { type: 'Payer', id: payerId },
      ],
    }),

    getPayerByEmail: builder.query<PayerProfile, string>({
      query: (email) => `/payers/by-email/${encodeURIComponent(email)}`,
      providesTags: ({ id }) => [
        { type: 'Payer', id: id.value },
      ],
    }),

    getPayerEmails: builder.query<PayerEmail[], string>({
      query: (id) => `/payers/${id}/emails`,
      providesTags: (payers) => payers.flatMap(({ payerId, email }) => [
        { type: 'PayerEmail', id: `${payerId.value}-${email}` },
      ]),
    }),

    getSessionPayer: builder.query<PayerProfile, never>({
      query: () => '/payers/session',
      providesTags: ({ id }) => [
        { type: 'Payer', id: id.value },
        { type: 'Session', id: 'CURRENT' },
      ],
    }),

    getPayerByTkoalyId: builder.query<PayerProfile, number>({
      query: (id) => `/payers/by-tkoaly-id/${id}`,
      providesTags: ({ id }) => [
        { type: 'Payer', id: id.value },
      ],
    }),

    getPayerDebts: builder.query<(Debt & DebtComponentDetails)[], { id: string, includeDrafts?: boolean }>({
      query: ({ id, includeDrafts }) => ({
        url: `/payers/${id}/debts`,
        params: {
          includeDrafts: includeDrafts ? 'true' : 'false',
        }
      }),
      providesTags: (debts) => debts.flatMap(({ id }) => [
        { type: 'Debt', id },
      ]),
    }),

    sendPayerDebtReminder: builder.mutation<{ messageSent: boolean, messageDebtCount: number }, { payerId: string, send: boolean }>({
      query: (body) => ({
        url: `/payers/${body.payerId}/send-reminder`,
        method: 'POST',
        body: {
          send: body.send,
        },
      }),
      invalidatesTags: [{ type: 'Email', id: 'LIST' }],
    }),
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
  useGetPayersQuery,
  useSendPayerDebtReminderMutation,
} = payersApi

export default payersApi
