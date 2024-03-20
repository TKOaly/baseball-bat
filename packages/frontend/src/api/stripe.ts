import { Payment } from '@bbat/common/src/types';
import rtkApi from './rtk-api';

export type StripeConfig = {
  publicKey: string;
};

const stripeApi = rtkApi.injectEndpoints({
  endpoints: builder => ({
    getConfig: builder.query<StripeConfig, void>({
      query: () => '/stripe/config',
    }),

    getPaymentByIntent: builder.query<{ payment: Payment }, string>({
      query: intent => ({
        url: '/stripe/get-payment',
        params: { intent },
      }),
    }),
  }),
});

export const { useGetConfigQuery, useGetPaymentByIntentQuery } = stripeApi;
export default stripeApi;
