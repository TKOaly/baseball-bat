import rtkApi from './rtk-api'
import { UpstreamUser } from '../../common/types'

const upstreamUsersApi = rtkApi.injectEndpoints({
  endpoints: builder => ({
    getUpstreamUsers: builder.query<UpstreamUser[], void>({
      query: () => '/users',
    }),

    getUpstreamUser: builder.query<UpstreamUser, number>({
      query: (id) => `/users/${id}`,
    }),
  })
});

export const {
  useGetUpstreamUsersQuery,
  useGetUpstreamUserQuery
} = upstreamUsersApi

export default upstreamUsersApi
