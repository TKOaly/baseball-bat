import { Middleware, Response } from 'typera-express'
import { TokenPayload } from '../common/types'
import * as Either from 'fp-ts/Either'
import * as Option from 'fp-ts/Option'
import * as Array from 'fp-ts/Array'
import * as TaskEither from 'fp-ts/TaskEither'
import { flow, pipe } from 'fp-ts/lib/function'
import { verify } from './jwt'

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

export const createAuthMiddleware =
  (
    jwtSecret: string
  ): Middleware.Middleware<
    { user: TokenPayload },
    Response.Unauthorized<string>
  > =>
  async ({ req }) => {
    return pipe(
      getToken(req.header('Authorization')),
      TaskEither.fromEither,
      TaskEither.chain(token => verify(token, jwtSecret)),
      TaskEither.foldW(
        error => () =>
          Promise.resolve(Middleware.stop(Response.unauthorized(error))),
        user => () => Promise.resolve(Middleware.next({ user }))
      )
    )()
  }
