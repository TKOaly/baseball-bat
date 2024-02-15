import { createScope } from '@/bus';
import {
  tkoalyIdentityT,
  payerProfile,
  emailIdentityT,
  internalIdentityT,
  payerEmail,
  payerPreferences,
  payerPreferencePatch,
} from '@bbat/common/types';
import * as t from 'io-ts';
import * as types from '@bbat/common/types';

const scope = createScope('payers');

export const getPayerProfileByIdentity = scope.defineProcedure({
  name: 'getPayerProfileByIdentity',
  payload: t.union([internalIdentityT, emailIdentityT, tkoalyIdentityT]),
  response: t.union([t.null, payerProfile]),
});

export const getPayerProfileByTkoalyIdentity = scope.defineProcedure({
  name: 'getPayerProfileByTkoalyIdentity',
  payload: tkoalyIdentityT,
  response: t.union([t.null, payerProfile]),
});

export const getPayerProfileByEmailIdentity = scope.defineProcedure({
  name: 'getPayerProfileByEmailIdentity',
  payload: emailIdentityT,
  response: t.union([t.null, payerProfile]),
});

export const getPayerProfileByInternalIdentity = scope.defineProcedure({
  name: 'getPayerProfileByInternalIdentity',
  payload: internalIdentityT,
  response: t.union([t.null, payerProfile]),
});

export const createPayerProfileFromTkoalyIdentity = scope.defineProcedure({
  name: 'createPayerProfileFromTkoalyIdentity',
  payload: t.type({
    id: tkoalyIdentityT,
    token: t.string,
  }),
  response: t.union([t.null, payerProfile]),
});

export const createPayerProfileFromEmailIdentity = scope.defineProcedure({
  name: 'createPayerProfileFromEmailIdentity',
  payload: t.type({
    id: emailIdentityT,
    name: t.string,
  }),
  response: t.union([t.null, payerProfile]),
});

export const createPayerProfileForExternalIdentity = scope.defineProcedure({
  name: 'createPayerProfileFromEmailIdentity',
  payload: t.intersection([
    t.type({
      id: t.union([emailIdentityT, tkoalyIdentityT]),
      token: t.string,
    }),
    t.partial({
      name: t.string,
    }),
  ]),
  response: t.union([t.null, payerProfile]),
});

export const getPayerPrimaryEmail = scope.defineProcedure({
  name: 'getPayerPrimaryEmail',
  payload: internalIdentityT,
  response: t.union([t.null, payerEmail]),
});

export const mergeProfiles = scope.defineProcedure({
  name: 'mergeProfiles',
  payload: t.type({
    primary: internalIdentityT,
    secondary: internalIdentityT,
  }),
  response: t.array(t.string),
});

export const setProfileTkoalyIdentity = scope.defineProcedure({
  name: 'setProfileTkoalyIdentity',
  payload: t.type({
    id: internalIdentityT,
    tkoalyId: tkoalyIdentityT,
  }),
  response: t.void,
});

export const updatePayerPreferences = scope.defineProcedure({
  name: 'updatePayerPreferences',
  payload: t.type({
    id: internalIdentityT,
    preferences: payerPreferencePatch,
  }),
  response: payerPreferences,
});

export const getPayerEmails = scope.defineProcedure({
  name: 'getPayerEmails',
  payload: internalIdentityT,
  response: t.array(types.payerEmail),
});

export const getPayerProfiles = scope.defineProcedure({
  name: 'getPaytkoalyIdentity(erProfiles',
  payload: t.void,
  response: t.array(types.payerProfile),
});

export const addPayerEmail = scope.defineProcedure({
  name: 'addPayerEmail',
  payload: t.type({
    payerId: internalIdentityT,
    email: t.string,
    source: types.payerEmailSource,
    priority: types.payerEmailPriority,
  }),
  response: types.payerEmail,
});

export const updatePayerEmailPriority = scope.defineProcedure({
  name: 'updatePayerEmailPriority',
  payload: t.type({
    payerId: internalIdentityT,
    email: t.string,
    priority: types.payerEmailPriority,
  }),
  response: types.payerEmail,
});

export const updatePayerDisabledStatus = scope.defineProcedure({
  name: 'updatePayerDisabledStatus',
  payload: t.type({
    payerId: internalIdentityT,
    disabled: t.boolean,
  }),
  response: types.payerProfile,
});

export const updatePayerName = scope.defineProcedure({
  name: 'updatePayerName',
  payload: t.type({
    payerId: internalIdentityT,
    name: t.string,
  }),
  response: types.payerProfile,
});

export const getPayerPreferences = scope.defineProcedure({
  name: 'getPayerPreferences',
  payload: internalIdentityT,
  response: t.union([t.null, types.payerPreferences]),
});

export const getOrCreatePayerProfileForIdentity = scope.defineProcedure({
  name: 'getOrCreatePayerProfileForIdentity',
  payload: t.type({
    token: t.string,
    id: types.identityT,
  }),
  response: t.union([t.null, types.payerProfile]),
});
