import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import {
  PayerPreferences,
  PayerProfile,
  payerPreferences,
} from '@bbat/common/types';
import api from './api/rtk-api';
import * as t from 'io-ts';
import { RootState } from './store';
import { BACKEND_URL } from './config';
import { isRight } from 'fp-ts/lib/Either';

export const createSession = createAsyncThunk(
  'session/createSession',
  async (): Promise<string> => {
    const res = await fetch(`${BACKEND_URL}/api/auth/init`, {
      method: 'POST',
    });
    const body = await res.json();
    return body?.token;
  },
);

export const destroySession = createAsyncThunk<
  void,
  void,
  { state: RootState }
>('session/destroySession', async (_payload, thunkApi): Promise<void> => {
  const state = thunkApi.getState();
  const sessionToken = state.session.token;

  const res = await fetch(`${BACKEND_URL}/api/auth/destroy-session`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${sessionToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (res.ok) {
    return Promise.resolve();
  } else {
    return Promise.reject();
  }
});

export const authenticateSession = createAsyncThunk<
  {
    accessLevel: AccessLevel;
    payerProfile: PayerProfile;
    preferences: PayerPreferences;
  },
  string,
  { state: RootState; rejectValue: { message?: string } }
>('session/authenticateSession', async (authToken: string, thunkApi) => {
  const state = thunkApi.getState();
  const sessionToken = state.session.token;

  if (!sessionToken) {
    return thunkApi.rejectWithValue({});
  }

  const res = await fetch(`${BACKEND_URL}/api/auth/authenticate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${sessionToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      id: authToken,
      remote: false,
    }),
  });

  if (res.ok) {
    const session_res = await fetch(`${BACKEND_URL}/api/session`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        'Content-Type': 'application/json',
      },
    });

    return await session_res.json();
  } else {
    try {
      const body = await res.json();

      return thunkApi.rejectWithValue({
        message: body.message,
      });
    } catch {
      return thunkApi.rejectWithValue({});
    }
  }
});

type RefreshSessionResponse = {
  token: string;
  payerId: string;
  authLevel: string;
  accessLevel: AccessLevel;
  preferences: PayerPreferences;
};

export const refreshSession = createAsyncThunk<
  RefreshSessionResponse,
  void,
  { state: RootState }
>('session/refresh', async (_, thunkApi) => {
  const state = thunkApi.getState();
  const { token } = state.session;

  if (!token) {
    return Promise.reject();
  }

  const res = await fetch(`${BACKEND_URL}/api/session`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  const body = await res.json();

  if (res.ok) {
    return {
      token,
      authLevel: body.authLevel,
      accessLevel: body.accessLevel,
      preferences: body.preferences,
      payerId: body.payerProfile?.id?.value,
    };
  } else {
    return Promise.reject();
  }
});

export enum SessionStatus {
  INVALID = 'invalid',
  CREATING = 'creating',
  REFRESHING = 'refreshing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum AccessLevel {
  NORMAL = 'normal',
  ADMIN = 'admin',
}

const accessLevel = t.union([t.literal('normal'), t.literal('admin')]);

const sessionDataT = t.type({
  userId: t.string,
  accessLevel: accessLevel,
  preferences: payerPreferences,
});

const sessionStateT = t.type({
  token: t.union([t.null, t.string]),
  data: t.union([t.null, sessionDataT]),
  error: t.union([t.null, t.string]),
  status: t.union([
    t.literal('invalid'),
    t.literal('creating'),
    t.literal('refreshing'),
    t.literal('completed'),
    t.literal('failed'),
  ]),
});

export type SessionState = t.TypeOf<typeof sessionStateT>;
export type SessionData = t.TypeOf<typeof sessionDataT>;

const sessionSlice = createSlice({
  name: 'session',
  initialState: {
    token: null,
    status: SessionStatus.INVALID,
    data: null,
    error: null,
  } as SessionState,
  reducers: {
    resetSession: state => {
      state.token = null;
      state.data = null;
      state.status = SessionStatus.INVALID;
    },

    hydrateSession: () => {
      const stored = localStorage.getItem('bbat-session');

      if (!stored) {
        return;
      }

      let parsed;

      try {
        parsed = JSON.parse(stored);
      } catch {
        return;
      }

      const result = sessionStateT.decode(parsed);

      if (isRight(result)) {
        return {
          ...result.right,
          status: SessionStatus.INVALID,
        };
      }

      return;
    },
  },
  extraReducers: builder => {
    builder.addCase(destroySession.pending, state => {
      state.status = SessionStatus.REFRESHING;
    });

    builder.addCase(destroySession.fulfilled, state => {
      state.token = null;
      state.data = null;
      state.status = SessionStatus.INVALID;
    });

    builder.addCase(createSession.pending, state => {
      state.status = SessionStatus.CREATING;
    });

    builder.addCase(createSession.fulfilled, (state, action) => {
      state.token = action.payload;
      state.status = SessionStatus.COMPLETED;
    });

    builder.addCase(authenticateSession.fulfilled, (state, action) => {
      state.data = {
        accessLevel: action.payload.accessLevel,
        userId: action.payload.payerProfile.id.value,
        preferences: action.payload.preferences,
      };

      api.util.invalidateTags([{ type: 'Session', id: 'CURRENT' }]);
    });

    builder.addCase(authenticateSession.rejected, (state, action) => {
      state.error = action.payload?.message ?? null;
    });

    builder.addCase(refreshSession.pending, state => {
      state.status = SessionStatus.REFRESHING;
    });

    builder.addCase(refreshSession.fulfilled, (state, action) => {
      const { payerId, authLevel, accessLevel, preferences } = action.payload;

      state.status = SessionStatus.COMPLETED;

      if (authLevel === 'unauthenticated') {
        state.data = null;
      } else {
        state.data = {
          userId: payerId,
          accessLevel,
          preferences,
        };
      }
    });

    builder.addCase(refreshSession.rejected, state => {
      state.token = null;
      state.status = SessionStatus.INVALID;
      state.data = null;
    });
  },
});

export default sessionSlice;
