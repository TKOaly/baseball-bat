import { createScope } from "@/bus";
import * as t from 'io-ts';
import * as types from "@bbat/common/types";

const scope = createScope('users');

export const getUpstreamUserById = scope.defineProcedure({
    name: 'getUpstreamUserById',
    payload: t.type({
        token: t.string,
        id: types.tkoalyIdentityT,
    }),
    response: t.union([
        t.null,
        types.upstreamUser,
    ]),
});

export const getUpstreamUserByEmail = scope.defineProcedure({
    name: 'getUpstreamUserByEmail',
    payload: t.type({
        token: t.string,
        email: t.string,
    }),
    response: t.union([
        t.null,
        types.upstreamUser,
    ]),
});

export const getUpstreamUsers = scope.defineProcedure({
    name: 'getUpstreamUsers',
    payload: t.type({
        token: t.string,
    }),
    response: t.array(types.upstreamUser),
});

export const getTokenUpstreamUser = scope.defineProcedure({
    name: 'getTokenUpstreamUser',
    payload: t.type({
        token: t.string,
    }),
    response: t.union([
        t.null,
        types.upstreamUser,
    ]),
});