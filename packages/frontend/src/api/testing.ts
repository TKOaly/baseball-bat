import { Debt } from '@bbat/common/src/types';
import rtkApi from './rtk-api';

const testApi = rtkApi.injectEndpoints({
  endpoints: builder => ({
    createTestDebt: builder.mutation<{ debt: Debt }, void>({
      query: () => ({
        url: '/testing/create-debt',
        method: 'POST',
      }),
      invalidatesTags: [{ type: 'Debt', id: 'LIST' }],
    }),

    creditAllDebts: builder.mutation<{ debt: Debt }, void>({
      query: () => ({
        url: '/testing/credit-all',
        method: 'POST',
      }),
      invalidatesTags: [{ type: 'Debt' }],
    }),
  }),
});

export default testApi;

export const { useCreateTestDebtMutation, useCreditAllDebtsMutation } = testApi;
