import { createPaginatedQuery } from './pagination';
import rtkApi from './rtk-api';
import { Email } from '@bbat/common/types';

const emailApi = rtkApi.injectEndpoints({
  endpoints: builder => ({
    getEmails: createPaginatedQuery<Email>()(builder, {
      query: () => '/emails',
      paginationTag: 'Email',
    }),

    getEmailsByDebt: createPaginatedQuery<Email, { debtId: string }>()(
      builder,
      {
        query: ({ debtId }) => `/emails/by-debt/${debtId}`,
        paginationTag: 'Email',
      },
    ),

    getEmail: builder.query<Email, string>({
      query: id => `/emails/${id}`,
      providesTags: result =>
        result ? [{ type: 'Email', id: result.id }] : [],
    }),

    sendEmails: builder.mutation<void, string[]>({
      query: ids => ({
        method: 'POST',
        url: '/emails/send',
        body: { ids },
      }),
      invalidatesTags: (_result, _error, ids) => [
        { type: 'Email' as const, id: 'LIST' },
        ...ids.map(id => ({ type: 'Email' as const, id })),
      ],
    }),
  }),
});

export const {
  useGetEmailsQuery,
  useGetEmailQuery,
  useSendEmailsMutation,
  useGetEmailsByDebtQuery,
} = emailApi;

export default emailApi;
