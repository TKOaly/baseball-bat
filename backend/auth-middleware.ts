import { Middleware, Response, RequestBase } from 'typera-express'
import { internalIdentity, InternalIdentity, TokenPayload } from '../common/types'
import { v4 as uuid } from 'uuid'
import * as Either from 'fp-ts/Either'
import * as Option from 'fp-ts/Option'
import * as Array from 'fp-ts/Array'
import * as TaskEither from 'fp-ts/TaskEither'
import * as Task from 'fp-ts/Task'
import { flow, pipe } from 'fp-ts/lib/function'
import { Inject, Service } from 'typedi'
import { Config } from './config'
import { commandOptions, RedisClientType } from 'redis'
import * as t from 'io-ts'
import { upsertAt } from 'fp-ts/lib/ReadonlyRecord'
import { lookup } from 'dns'
import { range, reduce, map } from 'fp-ts/lib/NonEmptyArray'
import { randomElem } from 'fp-ts/lib/Random'
import { split } from 'fp-ts/lib/string'

type AuthMiddlewareSession<O extends AuthMiddlewareOptions> =
  (O['unauthenticated'] extends true ? Session : Session & { authLevel: 'authenticated' }) & (O['accessLevel'] extends 'normal' ? {} : { accessLevel: 'admin' })

type AuthMiddleware<O extends AuthMiddlewareOptions> =
  Middleware.Middleware<{ session: AuthMiddlewareSession<O> }, Response.Unauthorized<string>>

const accessLevel = t.union([
  t.literal('normal'),
  t.literal('admin'),
])

export type AccessLevel = t.TypeOf<typeof accessLevel>

const getToken = (tokenHeader?: string) =>
  pipe(
    Option.fromNullable(tokenHeader),
    Either.fromOption(() => 'No Authorization header'),
    Either.chain(
      flow(
        token => token.split(' '),
        Array.lookup(1),
        Either.fromOption(() => 'No token')
      )
    )
  )

const session = t.union([
  t.type({
    authLevel: t.literal('unauthenticated'),
  }),
  t.type({
    authLevel: t.literal('authenticated'),
    payerId: t.string,
    authMethod: t.string,
    accessLevel: accessLevel,
  }),
])


type Session = t.TypeOf<typeof session> & { token: string }

const verify = (redis: RedisClientType) => (token: string): TaskEither.TaskEither<string, Session> =>
  pipe(
    () => redis.get(`session:${token}`),
    Task.map(Either.fromNullable('No such session')),
    TaskEither.map(JSON.parse),
    TaskEither.chain(flow(
      (a) => (console.log(a), a),
      session.decode,
      Either.mapLeft(() => 'Invalid session'),
      Either.map((session) => ({ ...session, token })),
      TaskEither.fromEither,
    )),
  )

type AuthMiddlewareOptions = {
  unauthenticated?: boolean
  accessLevel?: AccessLevel
}

const filterSession: (<O extends AuthMiddlewareOptions>(options?: O) => (session: Session) => Either.Either<string, AuthMiddlewareSession<O>>) = <O extends AuthMiddlewareOptions>(options?: O) => flow(
  Either.fromPredicate(
    (session) => {
      return session.authLevel !== 'unauthenticated' || !!options?.unauthenticated;
    },
    () => 'Not authenticated',
  ),
  Either.map((session) => (session as any) as AuthMiddlewareSession<O>)
)

@Service()
export class AuthService {
  @Inject(() => Config)
  config: Config

  @Inject('redis')
  redis: RedisClientType

  private async getSession<R extends RequestBase>({ req }: R): Promise<Session | null> {
    const header = req.header('Authorization')

    if (!header) {
      return null;
    }

    const [authType, token] = header.split(' ');

    if (authType.toLowerCase() !== 'bearer') {
      return null;
    }

    const dataSerialized = await this.redis.get(`session:${token}`)

    if (dataSerialized === null) {
      return null;
    }

    let data

    try {
      data = JSON.parse(dataSerialized)
    } catch {
      return null;
    }

    return { ...data, token };
  }

  createAuthMiddleware<O extends AuthMiddlewareOptions>(options?: O): AuthMiddleware<O> {
    return (async (ctx: RequestBase) => {
      const session = await this.getSession(ctx);

      if (session === null) {
        return Middleware.stop(Response.unauthorized('No session'))
      }

      if (session.authLevel === 'unauthenticated') {
        if (!options?.unauthenticated) {
          return Middleware.stop(Response.unauthorized('Session not authenticated'))
        }
      } else {
        if (!options?.unauthenticated) {
          if (options?.accessLevel !== 'normal' && session.accessLevel !== 'admin') {
            return Middleware.stop(Response.unauthorized('Insufficient access level'))
          }
        }
      }

      return Middleware.next({ session })
    }) as any

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
  }

  async createAuthToken(payer: InternalIdentity, session: string) {
    const id = uuid();
    const secret = uuid();

    const code = pipe(
      range(0, 7),
      map(randomElem(split('')('0123456789ACDEFGHJKLMNPRSTUVWXY'))),
      reduce('', (a: string, n) => a + n)
    )

    await this.redis.set(`auth-token:${id}:payer`, payer.value)
    await this.redis.set(`auth-token:${id}:code`, code)
    await this.redis.set(`auth-token:${id}:secret`, secret)
    await this.redis.set(`auth-token:${id}:authenticated`, 'false')
    await this.redis.set(`auth-token:${id}:session`, session)

    return {
      token: id,
      code,
      secret,
    }
  }

  async resolveAuthToken(token: string) {
    await this.redis.set(`auth-token:${token}:authenticated`, 'true')
    await this.redis.lPush(`auth-token:${token}:notify`, 'true')
  }

  async validateAuthTokenCode(token: string, code: string) {
    const validCode = await this.redis.get(`auth-token:${token}:code`)
    return validCode !== null && validCode === code
  }

  async validateAuthTokenSecret(token: string, secret: string) {
    const validSecret = await this.redis.get(`auth-token:${token}:secret`)
    return validSecret !== null && validSecret === secret
  }

  async getAuthTokenPayerId(token: string) {
    const id = await this.redis.get(`auth-token:${token}:payer`)

    if (!id)
      return null

    return internalIdentity(id)
  }

  async getAuthTokenSession(token: string) {
    return this.redis.get(`auth-token:${token}:session`)
  }

  async getAuthTokenStatus(token: string, timeout?: number) {
    const authenticated = await this.redis.get(`auth-token:${token}:authenticated`)

    if (authenticated === 'true') {
      return true
    }

    if (!timeout) {
      return false
    }

    const value = await this.redis.brPop(
      commandOptions({ isolated: true }),
      `auth-token:${token}:notify`,
      timeout,
    )

    return value?.element === 'true'
  }

  async createSession() {
    const token = uuid();
    await this.redis.set(`session:${token}`, JSON.stringify({ authLevel: 'unauthenticated' }));
    return token
  }

  async authenticate(token: string, payerId: string, method: string, accessLevel: AccessLevel) {
    const session = {
      authLevel: 'authenticated',
      payerId,
      authMethod: method,
      accessLevel,
    };

    const exists = await this.redis.exists(`session:${token}`)

    if (!exists) {
      return Promise.reject();
    }

    await this.redis.set(`session:${token}`, JSON.stringify(session))

    return Promise.resolve();
  }
}

const a = new AuthService().createAuthMiddleware({ unauthenticated: true })
