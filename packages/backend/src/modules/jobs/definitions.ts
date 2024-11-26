import { createScope, createInterface } from '@/bus';
import {
  Percentage,
  job,
  paginationQueryPayload,
  paginationQueryResponse,
} from '@bbat/common/types';
import * as t from 'io-ts';

const scope = createScope('jobs');

export const poll = scope.defineProcedure({
  name: 'poll',
  payload: t.void,
  response: t.void,
});

export const execute = scope.defineProcedure({
  name: 'execute',
  payload: t.string,
  response: t.void,
});

export const create = scope.defineProcedure({
  name: 'create',
  payload: t.intersection([
    t.type({
      type: t.string,
      data: t.unknown,
    }),
    t.partial({
      title: t.string,
      retries: t.Integer,
      retryDelay: t.Integer,
      concurrencyLimit: t.Integer,
      limitClass: t.string,
      ratelimit: t.Integer,
      ratelimitPeriod: t.Integer,
    }),
  ]),
  response: t.string,
});

export const get = scope.defineProcedure({
  name: 'get',
  payload: t.string,
  response: t.union([t.null, job]),
});

export const list = scope.defineProcedure({
  name: 'list',
  payload: t.intersection([
    paginationQueryPayload,
    t.partial({ parent: t.string }),
  ]),
  response: paginationQueryResponse(job),
});

export const update = scope.defineProcedure({
  name: 'update',
  payload: t.intersection([
    t.type({
      id: t.string,
    }),
    t.partial({
      progress: Percentage,
    }),
  ]),
  response: t.void,
});

export const executor = createInterface('executor', builder => ({
  execute: builder.proc({
    payload: job,
    response: t.unknown,
  }),
}));
