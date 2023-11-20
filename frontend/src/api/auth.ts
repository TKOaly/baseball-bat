import rtkApi from './rtk-api';

const authApi = rtkApi.injectEndpoints({
  endpoints: builder => ({
    requestAuthCode: builder.mutation<{ id: string }, string>({
      query: email => ({
        url: '/auth/request-code',
        method: 'POST',
        body: { email },
      }),
    }),

    validateAuthCode: builder.mutation<
      { success: boolean },
      { id: string; code: string }
    >({
      query: payload => ({
        url: '/auth/validate-code',
        method: 'POST',
        body: payload,
      }),
    }),

    pollAuthStatus: builder.query<{ authenticated: boolean }, { id: string }>({
      query: payload => ({
        url: '/auth/poll-status',
        method: 'POST',
        body: payload,
      }),
    }),

    createSession: builder.mutation<{ token: string }, never>({
      query: () => ({
        url: '/auth/init',
        method: 'POST',
      }),
    }),
  }),
});

export const {
  useRequestAuthCodeMutation,
  useValidateAuthCodeMutation,
  usePollAuthStatusQuery,
  useCreateSessionMutation,
} = authApi;

export default authApi;
