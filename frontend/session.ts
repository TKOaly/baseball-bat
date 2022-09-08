import { createAsyncThunk, createSlice } from "@reduxjs/toolkit"
import { PayerPreferences } from "../common/types"

export const createSession = createAsyncThunk(
  'session/createSession',
  async (_payload: never, thunkAPI): Promise<string> => {
    const res = await fetch(`${process.env.BACKEND_URL}/api/auth/init`, { method: 'POST' })
    const body = await res.json()
    window.localStorage.setItem('session-token', body?.token)
    return body?.token
  },
)

export const authenticateSession = createAsyncThunk(
  'session/authenticateSession',
  async (authToken: string, thunkApi): Promise<void> => {
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
        payerId: body.payerProfile.id.value,
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
}

const sessionSlice = createSlice({
  name: 'session',
  initialState: {
    token: null,
    authenticated: false,
    payerId: null,
    bootstrapping: 'pending',
    preferences: null
  } as SessionState,
  reducers: {
    resetSession: (state) => {
      state.token = null;
      state.authenticated = false;
    },
  },
  extraReducers: builder => {
    builder.addCase(createSession.fulfilled, (state, action) => {
      state.token = action.payload
    })

    builder.addCase(authenticateSession.fulfilled, (state) => {
      state.authenticated = true
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
    })
  }
})

export default sessionSlice
