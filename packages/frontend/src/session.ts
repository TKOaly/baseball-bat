import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { PayerPreferences, PayerProfile } from '@bbat/common/types';
import api from './api/rtk-api';
import { RootState } from './store';
import { BACKEND_URL } from './config';

export const createSession = createAsyncThunk(
  'session/createSession',
  async (): Promise<string> => {
    const res = await fetch(`${BACKEND_URL}/api/auth/init`, {
      method: 'POST',
    });
    const body = await res.json();
    window.localStorage.setItem('session-token', body?.token);
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
  { state: RootState }
>('session/authenticateSession', async (authToken: string, thunkApi) => {
  const state = thunkApi.getState();
  const sessionToken = state.session.token;

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
    return Promise.reject();
  }
});

type RefreshSessionResponse = {
  token: string;
  payerId: string;
  authLevel: string;
  accessLevel: AccessLevel;
  preferences: PayerPreferences;
}

export const refreshSession = createAsyncThunk<RefreshSessionResponse, void, { state: RootState }>(
  'session/refresh',
  async (_, thunkApi) => {
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
  },
);

export enum SessionStatus {
  INVALID = 'invalid',
  CREATING = 'creating',
  REFRESHING = 'refreshing',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

export enum AccessLevel {
  NORMAL = 'normal',
  ADMIN = 'admin',
}

export type SessionData = {
  userId: string,
  accessLevel: AccessLevel,
  preferences: PayerPreferences,
};

type SessionState = {
  status: SessionStatus;
  token: string | null;
  data: SessionData | null;
};

const SESSION_TOKEN_KEY = 'session-token';

const getInitialToken = () => {
  return window.localStorage.getItem(SESSION_TOKEN_KEY);
};

const sessionSlice = createSlice({
  name: 'session',
  initialState: {
    token: getInitialToken(),
    status: SessionStatus.INVALID,
    data: null,
  } as SessionState,
  reducers: {
    resetSession: state => {
      state.token = null;
      state.data = null;
      state.status = SessionStatus.INVALID;
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
      window.localStorage.removeItem(SESSION_TOKEN_KEY);
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

    builder.addCase(refreshSession.pending, state => {
      state.status = SessionStatus.REFRESHING;
    });

    builder.addCase(refreshSession.fulfilled, (state, action) => {
      const { payerId, accessLevel, preferences } =
        action.payload;

      state.status = SessionStatus.COMPLETED;
      state.data = {
        userId: payerId,
        accessLevel,
        preferences,
      };
    });

    builder.addCase(refreshSession.rejected, state => {
      state.token = null;
      state.status = SessionStatus.FAILED;
      state.data = null;
      window.localStorage.removeItem(SESSION_TOKEN_KEY);
    });
  },
});

export default sessionSlice;
