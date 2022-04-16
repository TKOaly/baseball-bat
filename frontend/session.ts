import { createAsyncThunk, createSlice } from "@reduxjs/toolkit"

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
  async (): Promise<{ token: string, authLevel: string, accessLevel: 'admin' | 'normal' }> => {
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
      }
    } else {
      return Promise.reject()
    }
  },
)

type SessionState = {
  token: string | null
  authenticated: boolean
  bootstrapping: 'pending' | 'active' | 'completed'
  accessLevel: 'normal' | 'admin'
}

const sessionSlice = createSlice({
  name: 'session',
  initialState: {
    token: null,
    authenticated: false,
    bootstrapping: 'pending'
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

    builder.addCase(authenticateSession.fulfilled, (state, action) => {
      state.authenticated = true
      state.accessLevel = action.accessLevel
    })

    builder.addCase(bootstrapSession.pending, (state) => {
      state.bootstrapping = 'active'
    })

    builder.addCase(bootstrapSession.fulfilled, (state, action) => {
      const { token, authLevel, accessLevel } = action.payload
      state.bootstrapping = 'completed'
      state.authenticated = authLevel !== 'unauthenticated'
      state.token = token
      state.accessLevel = accessLevel
    })

    builder.addCase(bootstrapSession.rejected, (state, _action) => {
      state.bootstrapping = 'completed'
      state.authenticated = false
    })
  }
})

export default sessionSlice
