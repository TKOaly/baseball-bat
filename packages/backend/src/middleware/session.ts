import { Span } from '@opentelemetry/api';
import { Logger } from 'winston';
import {
  InternalIdentity,
  internalIdentity,
  internalIdentityT,
} from '@bbat/common/types';
import { createClient } from 'redis';
import { Middleware, Response } from 'typera-express';
import * as E from 'fp-ts/Either';
import * as t from 'io-ts';
import { flow } from 'fp-ts/function';
import { badRequest, unauthorized } from 'typera-common/response';
import { Config } from '@/config';

type Redis = ReturnType<typeof createClient>;

export type Session = { token: string } & t.TypeOf<typeof sessionData>;

export type SessionMiddleware = Middleware.ChainedMiddleware<
  { redis: Redis; span: Span; logger: Logger },
  { session: Session | null; isServiceRequest: boolean },
  | Response.BadRequest<string, undefined>
  | Response.Unauthorized<undefined, undefined>
>;

const InternalIdentityFromString = new t.Type(
  'InternalIdentityFromString',
  internalIdentityT.is,
  flow(t.string.decode, E.map(internalIdentity)),
  (id: InternalIdentity) => id.value,
);

const sessionData = t.union([
  t.type({
    authLevel: t.literal('unauthenticated'),
  }),
  t.type({
    authLevel: t.literal('authenticated'),
    payerId: InternalIdentityFromString,
  }),
]);

export const sessionMiddleware =
  (config: Config): SessionMiddleware =>
  async ({ redis, req, span, logger }) => {
    const header = req.header('Authorization');

    if (!header) {
      span.setAttribute('session', 'no');
      return Middleware.next({ session: null, isServiceRequest: false });
    }

    const [kind, token] = header.split(/\s+/g, 2);

    if (kind.toLowerCase() !== 'bearer') {
      return Middleware.stop(badRequest('Invalid authorization header!'));
    }

    if (token === config.integrationSecret) {
      span.setAttribute('session', 'integration');
      return Middleware.next({
        session: null,
        isServiceRequest: true,
      });
    }

    const dataSerialized = await redis.get(`session:${token}`);

    if (!dataSerialized) {
      return Middleware.stop(unauthorized());
    }

    let data;

    try {
      const parsed = JSON.parse(dataSerialized);
      const result = sessionData.decode(parsed);

      if (E.isRight(result)) {
        data = result.right;
      } else {
        logger.error('Failed to deserialize session!', {
          data: dataSerialized,
        });
        return Middleware.stop(unauthorized());
      }
    } catch {
      logger.error('Failed to deserialize session!', { data: dataSerialized });
      return Middleware.stop(unauthorized());
    }

    span.setAttribute('session', 'yes');
    span.setAttribute('session:auth', data.authLevel);

    return Middleware.next({
      session: {
        ...data,
        token,
      },
      isServiceRequest: false,
    });
  };
