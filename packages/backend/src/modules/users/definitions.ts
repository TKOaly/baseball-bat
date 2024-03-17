import { createScope } from '@/bus';
import * as t from 'io-ts';
import * as types from '@bbat/common/types';

const scope = createScope('users');

export const getUpstreamUserById = scope.defineProcedure({
  name: 'getUpstreamUserById',
  payload: t.type({
    id: types.tkoalyIdentityT,
  }),
  response: t.union([t.null, types.upstreamUser]),
});

export const getUpstreamUserByEmail = scope.defineProcedure({
  name: 'getUpstreamUserByEmail',
  payload: t.type({
    email: t.string,
  }),
  response: t.union([t.null, types.upstreamUser]),
});

export const getUpstreamUsers = scope.defineProcedure({
  name: 'getUpstreamUsers',
  payload: t.void,
  response: t.array(types.upstreamUser),
});

export const getTokenUpstreamUser = scope.defineProcedure({
  name: 'getTokenUpstreamUser',
  payload: t.string,
  response: t.union([t.null, types.upstreamUser]),
});
