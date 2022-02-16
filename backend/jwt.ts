import jwt from 'jsonwebtoken'
import { TokenPayload } from '../common/types'
import * as TaskEither from 'fp-ts/TaskEither'
import { pipe } from 'fp-ts/lib/function'

export const verify = (token: string, tokenSecret: string) =>
  pipe(
    TaskEither.tryCatch(
      () =>
        new Promise<unknown>((resolve, reject) => {
          jwt.verify(token, tokenSecret, (err, token) => {
            if (err) reject('Failed to verify token')
            resolve(token)
          })
        }),
      () => 'Failed to verify token'
    ),
    TaskEither.chainEitherKW(TokenPayload.decode),
    TaskEither.mapLeft(() => 'Malformed token')
  )

export const sign = (payload: TokenPayload, tokenSecret: string) =>
  new Promise<string>((resolve, reject) => {
    jwt.sign(payload, tokenSecret, { expiresIn: '2h' }, (err, token) => {
      if (err) reject('Failed to verify token')
      resolve(token!)
    })
  })
