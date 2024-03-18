import rtkApi from './rtk-api';

export type StripeConfig = {
  publicKey: string;
};

const stripeApi = rtkApi.injectEndpoints({
  endpoints: builder => ({
    getConfig: builder.query<StripeConfig, void>({
      query: () => '/stripe/config',
    }),
  }),
});

export const { useGetConfigQuery } = stripeApi;
export default stripeApi;
