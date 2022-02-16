import axios from 'axios'
import { Config } from '../config'
import { UpstreamUser } from '../../common/types'

export type UserService = {
  getUpstreamUser: (token: string) => Promise<UpstreamUser>
}

export const createUserService = (config: Config): UserService => {
  const client = axios.create({
    baseURL: config.userApiUrl,
    headers: {
      Service: config.userApiServiceId,
    },
  })

  return {
    getUpstreamUser: token =>
      client
        .get<{ payload: UpstreamUser }>('/api/users/me', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })
        .then(({ data }) => data.payload),
  }
}
