import { createAsyncThunk, createSlice } from "@reduxjs/toolkit"
import { PayerPreferences, Session } from "../common/types"

export const createSession = createAsyncThunk(
  'session/createSession',
  async (_payload: never, thunkAPI): Promise<string> => {
    const res = await fetch(`${process.env.BACKEND_URL}/api/auth/init`, { method: 'POST' })
    const body = await res.json()
    window.localStorage.setItem('session-token', body?.token)
    return body?.token
  },
)

export const destroySession = createAsyncThunk(
  'session/destroySession',
  async (_payload: never, thunkApi): Promise<void> => {
    const state = thunkApi.getState() as any
    const sessionToken = state.session.token

    const res = await fetch(`${process.env.BACKEND_URL}/api/auth/destroy-session`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sessionToken}`,
        'Content-Type': 'application/json',
      },
    })

    if (res.ok) {
      return Promise.resolve();
    } else {
      return Promise.reject();
    }
  },
)

export const authenticateSession = createAsyncThunk(
  'session/authenticateSession',
  async (authToken: string, thunkApi): Promise<{ accessLevel: 'normal' | 'admin' }> => {
    const state = thunkApi.getState() as any
    const sessionToken = state.session.token

    const res = await fetch(`${process.env.BACKEND_URL}/api/auth/authenticate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: authToken,
        remote: false,
      }),
    })

    if (res.ok) {
      const session_res = await fetch(`${process.env.BACKEND_URL}/api/session`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${sessionToken}`,
          'Content-Type': 'application/json',
        },
      })

      return await session_res.json();
    } else {
      return Promise.reject();
    }
  }
)

export const bootstrapSession = createAsyncThunk(
  'session/bootstrap',
  async (): Promise<{ token: string, payerId: string, authLevel: string, accessLevel: 'admin' | 'normal', preferences: PayerPreferences }> => {
    const token = window.localStorage.getItem('session-token')

    if (!token) {
      return Promise.reject();
    }

    const res = await fetch(`${process.env.BACKEND_URL}/api/session`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    })

    const body = await res.json()

    if (res.ok) {
      return {
        token,
        authLevel: body.authLevel,
        accessLevel: body.accessLevel,
        preferences: body.preferences,
        payerId: body.payerProfile?.id?.value,
      }
    } else {
      return Promise.reject()
    }
  },
)

type SessionState = {
  token: string | null
  authenticated: boolean
  payerId: null | string
  bootstrapping: 'pending' | 'active' | 'completed'
  accessLevel: 'normal' | 'admin'
  preferences: null | PayerPreferences
  creatingSession: boolean
}

const sessionSlice = createSlice({
  name: 'session',
  initialState: {
    token: null,
    authenticated: false,
    payerId: null,
    bootstrapping: 'pending',
    preferences: null,
    creatingSession: false,
  } as SessionState,
  reducers: {
    resetSession: (state) => {
      state.token = null;
      state.authenticated = false;
    },
  },
  extraReducers: builder => {
    builder.addCase(destroySession.pending, (state) => {
      state.token = null;
      state.authenticated = false;
    });

    builder.addCase(createSession.pending, (state, _action) => {
      state.token = null;
      state.creatingSession = true;
    })

    builder.addCase(createSession.fulfilled, (state, action) => {
      state.token = action.payload
      state.creatingSession = false
    })

    builder.addCase(createSession.rejected, (state, _action) => {
      state.creatingSession = false
    })

    builder.addCase(authenticateSession.fulfilled, (state, action) => {
      state.authenticated = true
      state.accessLevel = action.payload.accessLevel
    })

    builder.addCase(bootstrapSession.pending, (state) => {
      state.bootstrapping = 'active'
    })

    builder.addCase(bootstrapSession.fulfilled, (state, action) => {
      const { token, authLevel, payerId, accessLevel, preferences } = action.payload
      state.bootstrapping = 'completed'
      state.authenticated = authLevel !== 'unauthenticated'
      state.token = token
      state.accessLevel = accessLevel
      state.preferences = preferences
      state.payerId = payerId
    })

    builder.addCase(bootstrapSession.rejected, (state, _action) => {
      state.bootstrapping = 'completed'
      state.authenticated = false
      state.token = null
      window.localStorage.removeItem('session-token')
    })
  }
})

export default sessionSlice
