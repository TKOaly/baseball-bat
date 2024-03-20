import rtkApi from './rtk-api';

const authApi = rtkApi.injectEndpoints({
  endpoints: builder => ({
    requestAuthCode: builder.mutation<{ id: string }, string>({
      query: email => ({
        url: '/session/request-code',
        method: 'POST',
        body: { email },
      }),
    }),

    validateAuthCode: builder.mutation<
      { success: boolean },
      { id: string; code: string }
    >({
      query: payload => ({
        url: '/session/validate-code',
        method: 'POST',
        body: payload,
      }),
    }),
  }),
});

export const { useRequestAuthCodeMutation, useValidateAuthCodeMutation } =
  authApi;

export default authApi;
