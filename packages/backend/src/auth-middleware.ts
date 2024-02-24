import { Middleware, Response, RequestBase } from 'typera-express';
import {
  internalIdentity,
  InternalIdentity,
  internalIdentityT,
} from '@bbat/common/build/src/types';
import { v4 as uuid } from 'uuid';
import { pipe } from 'fp-ts/lib/function';
import { commandOptions } from 'redis';
import * as t from 'io-ts';
import { range, reduce, map } from 'fp-ts/lib/NonEmptyArray';
import { randomElem } from 'fp-ts/lib/Random';
import { split } from 'fp-ts/lib/string';
import { BusContext, ModuleDeps } from './app';
import { getPayerProfileByIdentity } from './services/payers/definitions';
import { getUpstreamUserById } from './services/users/definitions';
import { ExecutionContext } from './bus';
import { createInterface } from './bus';

type AuthMiddlewareSession<O extends AuthMiddlewareOptions> =
  (O['unauthenticated'] extends true
    ? Session
    : Session & { authLevel: 'authenticated' }) &
    (O['accessLevel'] extends 'normal'
      ? Record<string, never>
      : { accessLevel: 'admin' });

type AuthMiddleware<O extends AuthMiddlewareOptions> =
  Middleware.ChainedMiddleware<
    { bus: ExecutionContext<BusContext> },
    { session: AuthMiddlewareSession<O> },
    Response.Unauthorized<string>
  >;

const accessLevel = t.union([t.literal('normal'), t.literal('admin')]);

export type AccessLevel = t.TypeOf<typeof accessLevel>;

const session = t.union([
  t.type({
    authLevel: t.literal('unauthenticated'),
  }),
  t.type({
    authLevel: t.literal('authenticated'),
    payerId: internalIdentityT,
    authMethod: t.string,
    accessLevel: accessLevel,
  }),
]);

type Session = t.TypeOf<typeof session> & { token: string };

type AuthMiddlewareOptions = {
  unauthenticated?: boolean;
  accessLevel?: AccessLevel;
  allowQueryToken?: boolean;
};

export const iface = createInterface('auth', builder => ({
  authenticateSession: builder.proc({
    payload: t.intersection([
      t.type({
        token: t.string,
        payerId: internalIdentityT,
        method: t.string,
      }),
      t.partial({
        userServiceToken: t.string,
        accessLevel: t.string,
      }),
    ]),
    response: t.void,
  }),
}));

export const { authenticateSession } = iface.procedures;

export const authServiceFactory = ({
  bus,
  redis,
  config,
}: Pick<ModuleDeps, 'bus' | 'redis' | 'config'>) => {
  async function getSession<R extends RequestBase>(
    { req }: R,
    allowQueryToken: boolean,
  ): Promise<[Session | null, string | null]> {
    const getTokenFromHeader = () => {
      const header = req.header('Authorization');

      if (!header) {
        return null;
      }

      const [authType, token] = header.split(' ');

      if (authType.toLowerCase() !== 'bearer') {
        return null;
      }

      return token;
    };

    const getTokenFromQuery = () => {
      if (typeof req.query.token === 'string') {
        return req.query.token;
      } else {
        return null;
      }
    };

    let token = getTokenFromHeader();

    if (!token && allowQueryToken) {
      token = getTokenFromQuery();
    }

    if (!token) {
      return [null, null];
    }

    const dataSerialized = await redis.get(`session:${token}`);

    if (dataSerialized === null) {
      return [null, token];
    }

    let data;

    try {
      data = JSON.parse(dataSerialized);
    } catch {
      return [null, token];
    }

    return [
      {
        ...data,
        payerId: internalIdentity(data.payerId),
        token,
      },
      token,
    ];
  }

  bus.provide(iface, {
    async authenticateSession(
      { accessLevel: pAccessLevel, method, token, payerId, userServiceToken },
      _,
      bus,
    ) {
      let accessLevel = pAccessLevel;

      if (accessLevel === undefined) {
        const profile = await bus.exec(getPayerProfileByIdentity, payerId);

        if (!profile) {
          throw new Error('Profile does not exist');
        }

        if (profile.tkoalyUserId && userServiceToken) {
          const user = await bus.exec(getUpstreamUserById, {
            id: profile.tkoalyUserId,
            token: userServiceToken,
          });

          if (user && user.role === 'yllapitaja') {
            accessLevel = 'admin';
          } else {
            accessLevel = 'normal';
          }
        } else {
          accessLevel = 'normal';
        }
      }

      const session = {
        authLevel: 'authenticated',
        payerId: payerId.value,
        authMethod: method,
        accessLevel,
      };

      console.log('? session:' + token);

      const exists = await redis.exists(`session:${token}`);

      if (!exists) {
        return Promise.reject();
      }

      await redis.set(`session:${token}`, JSON.stringify(session));

      return Promise.resolve();
    },
  });

  return {
    config,
    redis,

    createAuthMiddleware<O extends AuthMiddlewareOptions>(
      options?: O,
    ): AuthMiddleware<O> {
      const middleware = (async ctx => {
        const [session, token] = await getSession(
          ctx,
          options?.allowQueryToken === true,
        );

        if (session === null) {
          if (!options?.unauthenticated) {
            return Middleware.stop(Response.unauthorized('No session'));
          } else {
            return Middleware.next({
              session: { authLevel: 'unauthenticated', token },
            });
          }
        }

        if (session.authLevel === 'unauthenticated') {
          if (!options?.unauthenticated) {
            return Middleware.stop(
              Response.unauthorized('Session not authenticated'),
            );
          }
        } else {
          if (!options?.unauthenticated) {
            if (
              options?.accessLevel !== 'normal' &&
              session.accessLevel !== 'admin'
            ) {
              return Middleware.stop(
                Response.unauthorized('Insufficient access level'),
              );
            }
          }
        }

        return Middleware.next({ session });
      }) as AuthMiddleware<O>;

      return middleware;

      /*return async ({ req }) => pipe(
        getToken(req.header('Authorization')),
        TaskEither.fromEither,
        TaskEither.chain(verify(this.redis)),
        TaskEither.chainEitherK(filterSession(options)),
        TaskEither.foldW(
          error => () =>
            Promise.resolve(Middleware.stop(Response.unauthorized(error))),
          session => () => Promise.resolve(Middleware.next({ session }))
        ),
      )()*/
    },

    async createAuthToken(payer: InternalIdentity, session: string) {
      const id = uuid();
      const secret = uuid();

      const code = pipe(
        range(0, 7),
        map(randomElem(split('')('0123456789ACDEFGHJKLMNPRSTUVWXY'))),
        reduce('', (a: string, n) => a + n),
      );

      await this.redis.set(`auth-token:${id}:payer`, payer.value);
      await this.redis.set(`auth-token:${id}:code`, code);
      await this.redis.set(`auth-token:${id}:secret`, secret);
      await this.redis.set(`auth-token:${id}:authenticated`, 'false');
      await this.redis.set(`auth-token:${id}:session`, session);

      return {
        token: id,
        code,
        secret,
      };
    },

    async resolveAuthToken(token: string) {
      await this.redis.set(`auth-token:${token}:authenticated`, 'true');
      await this.redis.lPush(`auth-token:${token}:notify`, 'true');
    },

    async validateAuthTokenCode(token: string, code: string) {
      const validCode = await this.redis.get(`auth-token:${token}:code`);
      return validCode !== null && validCode === code;
    },

    async validateAuthTokenSecret(token: string, secret: string) {
      const validSecret = await this.redis.get(`auth-token:${token}:secret`);
      return validSecret !== null && validSecret === secret;
    },

    async getAuthTokenPayerId(token: string) {
      const id = await this.redis.get(`auth-token:${token}:payer`);

      if (!id) return null;

      return internalIdentity(id);
    },

    async getAuthTokenSession(token: string) {
      return this.redis.get(`auth-token:${token}:session`);
    },

    async getAuthTokenStatus(token: string, timeout?: number) {
      const authenticated = await this.redis.get(
        `auth-token:${token}:authenticated`,
      );

      if (authenticated === 'true') {
        return true;
      }

      if (!timeout) {
        return false;
      }

      const value = await this.redis.brPop(
        commandOptions({ isolated: true }),
        `auth-token:${token}:notify`,
        timeout,
      );

      return value?.element === 'true';
    },

    async createSession() {
      const token = uuid();
      console.log('session:' + token);
      await this.redis.set(
        `session:${token}`,
        JSON.stringify({ authLevel: 'unauthenticated' }),
      );
      return token;
    },

    async destroySession(token: string) {
      await this.redis.del(`session:${token}`);
    },

    async authenticate(
      bus: ExecutionContext<BusContext>,
      token: string,
      payerId: InternalIdentity,
      method: string,
      userServiceToken: string,
      pAccessLevel?: AccessLevel,
    ) {
      let accessLevel = pAccessLevel;

      if (accessLevel === undefined) {
        const profile = await bus.exec(getPayerProfileByIdentity, payerId);

        if (!profile) {
          throw new Error('Profile does not exist');
        }

        if (profile.tkoalyUserId) {
          const user = await bus.exec(getUpstreamUserById, {
            id: profile.tkoalyUserId,
            token: userServiceToken,
          });

          if (user && user.role === 'yllapitaja') {
            accessLevel = 'admin';
          } else {
            accessLevel = 'normal';
          }
        } else {
          accessLevel = 'normal';
        }
      }

      const session = {
        authLevel: 'authenticated',
        payerId: payerId.value,
        authMethod: method,
        accessLevel,
      };

      console.log('? session:' + token);

      const exists = await this.redis.exists(`session:${token}`);

      if (!exists) {
        return Promise.reject();
      }

      await this.redis.set(`session:${token}`, JSON.stringify(session));

      return Promise.resolve();
    },
  };
};

export type AuthService = ReturnType<typeof authServiceFactory>;
