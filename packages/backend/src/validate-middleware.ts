import { Middleware, Response } from 'typera-express';
import { pipe } from 'fp-ts/function';
import { foldW } from 'fp-ts/Either';
import * as t from 'io-ts';

export const validateBody =
  <A>(
    type: t.Decoder<unknown, A>,
  ): Middleware.Middleware<
    { body: A },
    Response.BadRequest<t.ValidationError[]>
  > =>
  ({ req }) =>
    pipe(
      type.decode(req.body),
      foldW(
        error => () =>
          Promise.resolve(Middleware.stop(Response.badRequest(error))),
        body => () => Promise.resolve(Middleware.next({ body })),
      ),
    )();
