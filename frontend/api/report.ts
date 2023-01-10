import rtkApi from './rtk-api';
import { DebtLedgerOptions, PaymentLedgerOptions, Report } from '../../common/types';

const reportApi = rtkApi.injectEndpoints({
  endpoints: builder => ({
    getReports: builder.query<Report[], void>({
      query: () => '/reports',
      providesTags: [{ type: 'Report', id: 'LIST' }],
    }),

    generateDebtLedger: builder.mutation<Report, DebtLedgerOptions>({
      query: (body) => ({
        url: '/reports/generate/debt-ledger',
        method: 'POST',
        body,
      }),
      invalidatesTags: [{ type: 'Report', id: 'LIST' }],
    }),

    generatePaymentLedger: builder.mutation<Report, PaymentLedgerOptions>({
      query: (body) => ({
        url: '/reports/generate/payment-ledger',
        method: 'POST',
        body,
      }),
      invalidatesTags: [{ type: 'Report', id: 'LIST' }],
    }),
  }),
});

export const {
  useGetReportsQuery,
  useGenerateDebtLedgerMutation,
  useGeneratePaymentLedgerMutation,
} = reportApi;

export default reportApi;

