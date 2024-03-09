import axios, { AxiosResponse } from 'axios';
import {
  TkoalyIdentityFromNumber,
  upstreamUserRole,
} from '@bbat/common/build/src/types';
import * as defs from './definitions';
import * as t from 'io-ts';
import * as T from 'fp-ts/Task';
import * as E from 'fp-ts/Either';
import * as O from 'fp-ts/Option';
import { flow, pipe } from 'fp-ts/function';
import { createModule } from '@/module';

const apiUpstreamUser = t.type({
  id: TkoalyIdentityFromNumber,
  screenName: t.string,
  email: t.string,
  username: t.string,
  role: upstreamUserRole,
});

const response = <P extends t.Type<any, any, any>>(payload: P) =>
  t.type({
    payload,
  });

export default createModule({
  name: 'users',

  async setup({ config, bus }) {
    const client = axios.create({
      baseURL: config.userServiceApiUrl,
      headers: {
        Service: config.serviceId,
      },
    });

    const fetchT = (path: string, token: string) => async () =>
      client.get(path, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

    const decodeResponse = <P extends t.Type<any, any, any>>(payload: P) =>
      flow(
        (r: AxiosResponse<unknown, unknown>) => r.data,
        response(payload).decode,
        E.map(({ payload }) => payload),
        O.fromEither,
      );

    bus.register(defs.getTokenUpstreamUser, async ({ token }) => {
      const handler = pipe(
        fetchT('/api/users/me', token),
        // T.tap(a => async () => console.log(a)),
        T.map(decodeResponse(apiUpstreamUser)),
        T.map(O.toNullable),
      );

      return handler();
    });

    bus.register(defs.getUpstreamUsers, async ({ token }) => {
      const handler = pipe(
        fetchT('/api/users', token),
        T.map(decodeResponse(t.array(apiUpstreamUser))),
        T.map(O.getOrElseW(() => [])),
      );

      return handler();
    });

    bus.register(defs.getUpstreamUserById, async ({ token, id }) => {
      const handler = pipe(
        fetchT(`/api/users/${id.value}`, token),
        T.map(decodeResponse(apiUpstreamUser)),
        T.map(O.toNullable),
      );

      return handler();
    });

    bus.register(
      defs.getUpstreamUserByEmail,
      async ({ token, email }, _, bus) => {
        const users = await bus.exec(defs.getUpstreamUsers, { token });
        return users.find(user => user.email === email) ?? null;
      },
    );
  },
});
