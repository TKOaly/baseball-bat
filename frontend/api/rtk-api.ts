import { RootState } from '../store';
import { createApi } from '@reduxjs/toolkit/query/react';
import { fetchBaseQuery } from '@reduxjs/toolkit/query';
import { pipe } from 'fp-ts/lib/function';
import sessionSlice from '../session';

const sessionAwareBaseQuery = (baseQuery) => async (args, api, extraOptions) => {
  const result = await baseQuery(args, api, extraOptions);

  if (result.meta.response.status === 401) {
    api.dispatch(sessionSlice.actions.resetSession);
  }

  return result;
};

const selectToken = (state: RootState) => state.session.token;

export default createApi({
  baseQuery: pipe(
    fetchBaseQuery({
      baseUrl: '/api/',
      prepareHeaders: (headers, ctx) => {
        const token = selectToken(ctx.getState() as any as RootState); // eslint-disable-line
        headers.set('Authorization', `Bearer ${token}`);
        return headers;
      },
    }),
    sessionAwareBaseQuery,
  ),
  endpoints: () => ({}),
  tagTypes: ['Debt', 'Email', 'Payment', 'Payer', 'PayerEmail', 'Session', 'BankAccount', 'BankTransaction', 'DebtCenter'],
});
