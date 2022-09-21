import rtkApi from './rtk-api'
import { Email } from '../../common/types'

const emailApi = rtkApi.injectEndpoints({
  endpoints: builder => ({
    getEmails: builder.query<Email[], never>({
      query: () => '/emails',
      providesTags: (result) => [
        { type: 'Email' as const, id: 'LIST' },
        ...result.map((email) => ({ type: 'Email' as const, id: email.id })),
      ]
    }),

    getEmail: builder.query<Email, string>({
      query: (id) => `/emails/${id}`,
      providesTags: (result) => [{ type: 'Email', id: result.id }],
    }),

    sendEmails: builder.mutation<void, string[]>({
      query: (ids) => ({
        method: 'POST',
        url: '/emails/send',
        body: { ids },
      }),
      invalidatesTags: (_result, _error, ids) => [
        { type: 'Email' as const, id: 'LIST' },
        ...ids.map((id) => ({ type: 'Email' as const, id })),
      ]
    })
  })
})

export const {
  useGetEmailsQuery,
  useGetEmailQuery,
  useSendEmailsMutation,
} = emailApi