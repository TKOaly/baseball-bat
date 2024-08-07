import { parseISO } from 'date-fns/parseISO';
import rtkApi from './rtk-api';
import {
  DebtComponentDetails,
  DebtWithPayer,
  PaginationQueryResponse,
  PayerEmail,
  PayerEmailPriority,
  PayerPreferences,
  PayerProfile,
} from '@bbat/common/types';
import { createPaginatedQuery } from './pagination';

export type UpdatePayerEmailsQueryPayload = {
  payerId: string;
  emails: PayerEmail[];
};

export type UpdatePayerPayload = {
  id: string;
  name?: string;
  emails?: { email: string; priority: PayerEmailPriority }[];
};

const payersApi = rtkApi.injectEndpoints({
  endpoints: builder => ({
    getPayers: createPaginatedQuery<PayerProfile>()(builder, {
      query: () => '/payers',
      paginationTag: 'Payer',
      id: payer => payer.id.value,
    }),

    getPayer: builder.query<PayerProfile, string>({
      query: id => `/payers/${id}`,
      providesTags: payer =>
        payer ? [{ type: 'Payer', id: payer.id.value }] : [],
    }),

    updatePayer: builder.mutation<PayerProfile, UpdatePayerPayload>({
      query: body => ({
        url: `/payers/${body.id}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: payer =>
        payer
          ? [
              { type: 'Payer', id: payer.id.value },
              { type: 'PayerEmail', id: payer.id.value },
            ]
          : [],
    }),

    updatePayerPreferences: builder.mutation<
      PayerPreferences,
      { payerId: string; preferences: Partial<PayerPreferences> }
    >({
      query: ({ payerId, preferences }) => ({
        url: `/payers/${payerId}/preferences`,
        method: 'PATCH',
        body: preferences,
      }),
      invalidatesTags: (_, __, { payerId }) => [{ type: 'Payer', id: payerId }],
    }),

    updatePayerEmails: builder.mutation<
      PayerEmail[],
      UpdatePayerEmailsQueryPayload
    >({
      query: ({ payerId, emails }) => ({
        url: `/payers/${payerId}/emails`,
        method: 'PATCH',
        body: emails,
      }),
      invalidatesTags: (_, __, { payerId }) => [{ type: 'Payer', id: payerId }],
    }),

    getPayerByEmail: builder.query<PayerProfile, string>({
      query: email => `/payers/by-email/${encodeURIComponent(email)}`,
      providesTags: response =>
        response !== undefined
          ? [{ type: 'Payer', id: response.id.value }]
          : [],
    }),

    getPayerEmails: builder.query<PayerEmail[], string>({
      query: id => `/payers/${id}/emails`,
      providesTags: (payers, _, id) => [
        { type: 'PayerEmail', id },
        ...(payers ?? []).map(({ email }) => ({
          type: 'PayerEmail' as const,
          id: `${id}-${email}`,
        })),
      ],
    }),

    getSessionPayer: builder.query<PayerProfile, void>({
      query: () => '/payers/session',
      providesTags: payer =>
        payer
          ? [
              { type: 'Payer', id: payer.id.value },
              { type: 'Session', id: 'CURRENT' },
            ]
          : [],
    }),

    getPayerByTkoalyId: builder.query<PayerProfile, number>({
      query: id => `/payers/by-tkoaly-id/${id}`,
      providesTags: payer =>
        payer ? [{ type: 'Payer', id: payer.id.value }] : [],
    }),

    getPayerDebts: createPaginatedQuery<
      DebtWithPayer & DebtComponentDetails,
      { id: string; includeDrafts?: boolean; limit?: number }
    >()(builder, {
      query: ({ id, includeDrafts, limit }) => ({
        url: `/payers/${id}/debts`,
        params: {
          includeDrafts: includeDrafts ? 'true' : 'false',
          limit: limit,
        },
      }),
      paginationTag: 'Debt',
      transformResponse: (
        response: PaginationQueryResponse<
          Omit<
            DebtWithPayer & DebtComponentDetails,
            'date' | 'publishedAt' | 'dueDate'
          > & { date: string; publishedAt: string; dueDate: string }
        >,
      ) => ({
        ...response,
        result: response.result.map(debt => ({
          ...debt,
          date: debt.date ? parseISO(debt.date) : null,
          publishedAt: debt.publishedAt ? parseISO(debt.publishedAt) : null,
          dueDate: debt.dueDate ? parseISO(debt.dueDate) : null,
        })),
      }),
    }),

    sendPayerDebtReminder: builder.mutation<
      { messageCount: number; payerCount: number; errors: string[] },
      { payerId: string; send: boolean; ignoreCooldown: boolean }
    >({
      query: body => ({
        url: `/payers/${body.payerId}/send-reminder`,
        method: 'POST',
        body: {
          send: body.send,
          ignoreCooldown: body.ignoreCooldown,
        },
      }),
      invalidatesTags: [{ type: 'Email', id: 'LIST' }],
    }),

    mergeProfiles: builder.mutation<
      { affectedDebts: string[] },
      { primaryPayerId: string; secondaryPayerId: string }
    >({
      query: body => ({
        url: `/payers/${body.primaryPayerId}/merge`,
        method: 'POST',
        body: {
          mergeWith: body.secondaryPayerId,
        },
      }),
      invalidatesTags: (result, __, { primaryPayerId, secondaryPayerId }) => [
        { type: 'Payer', id: primaryPayerId },
        { type: 'Payer', id: secondaryPayerId },
        { type: 'Payer', id: 'LIST' },
        { type: 'Debt', id: 'LIST' },
        ...(result?.affectedDebts ?? []).map(id => ({
          type: 'Debt' as const,
          id,
        })),
      ],
    }),

    createPayer: builder.mutation<
      PayerProfile,
      { name: string; email: string }
    >({
      query: body => ({
        url: '/payers',
        method: 'POST',
        body,
      }),
      invalidatesTags: [{ type: 'Payer', id: 'LIST' }],
    }),
  }),
});

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
  useMergeProfilesMutation,
  useUpdatePayerMutation,
  useCreatePayerMutation,
} = payersApi;

export default payersApi;
