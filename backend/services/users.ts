import axios from 'axios';
import { Config } from '../config';
import { TkoalyIdentity, UpstreamUser } from '../../common/types';
import { Inject, Service } from 'typedi';

@Service()
export class UsersService {
  @Inject(() => Config)
  config: Config;

  private _client: ReturnType<typeof axios.create> | null = null;

  get client() {
    if (this._client !== null) {
      return this._client;
    }

    this._client = axios.create({
      baseURL: this.config.userServiceApiUrl,
      headers: {
        Service: this.config.serviceId,
      },
    });

    return this._client;
  }

  async getUpstreamUserById(pId: TkoalyIdentity | 'me', token: string) {
    const id = typeof pId === 'string' ? pId : pId.value;

    try {
      const { data } = await this.client.get<{ payload: UpstreamUser }>(
        `/api/users/${id}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      return data.payload;
    } catch (err) {
      console.log(err);
      throw new Error(`Failed to fetch upstream user ${id}`);
    }
  }

  async getUpstreamUser(token: string): Promise<UpstreamUser> {
    const { data } = await this.client.get<{ payload: UpstreamUser }>(
      '/api/users/me',
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );

    return data.payload;
  }

  async getUpstreamUserByEmail(email: string, token: string) {
    const users = await this.getUsers(token);
    return users.find(user => user.email === email);
  }

  getUsers(token: string) {
    return this.client
      .get<{ payload: UpstreamUser[] }>('/api/users', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      .then(
        ({ data }) => data.payload,
        err => (console.log(err.response.data), []),
      );
  }
}
