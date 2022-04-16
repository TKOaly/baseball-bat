import rtkApi from './rtk-api'
import { UpstreamUser } from '../../common/types'

const upstreamUsersApi = rtkApi.injectEndpoints({
  endpoints: builder => ({
    getUpstreamUsers: builder.query<UpstreamUser[], never>({
      query: () => '/users',
    }),
  })
});

export const {
  useGetUpstreamUsersQuery
} = upstreamUsersApi
