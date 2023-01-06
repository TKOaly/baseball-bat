import { AccountingPeriod } from '../../common/types';
import rtkApi from './rtk-api';

const accountingApi = rtkApi.injectEndpoints({
  endpoints: builder => ({
    getAccountingPeriods: builder.query<AccountingPeriod[], void>({
      query: () => '/accounting/periods',
      providesTags: [{ type: 'AccountingPeriod', id: 'LIST' }],
    }),
  }),
});

export const {
  useGetAccountingPeriodsQuery,
} = accountingApi;

export default accountingApi;
