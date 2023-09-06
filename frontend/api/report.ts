import rtkApi from './rtk-api';
import {
  DebtLedgerOptions,
  DebtStatusReportOptions,
  PaymentLedgerOptions,
  Report,
} from '../../common/types';

const reportApi = rtkApi.injectEndpoints({
  endpoints: builder => ({
    getReports: builder.query<Report[], void>({
      query: () => '/reports',
      providesTags: [{ type: 'Report', id: 'LIST' }],
    }),

    generateDebtLedger: builder.mutation<Report, DebtLedgerOptions>({
      query: body => ({
        url: '/reports/generate/debt-ledger',
        method: 'POST',
        body,
      }),
      invalidatesTags: [{ type: 'Report', id: 'LIST' }],
    }),

    generatePaymentLedger: builder.mutation<Report, PaymentLedgerOptions>({
      query: body => ({
        url: '/reports/generate/payment-ledger',
        method: 'POST',
        body,
      }),
      invalidatesTags: [{ type: 'Report', id: 'LIST' }],
    }),

    generateDebtStatusReport: builder.mutation<Report, DebtStatusReportOptions>(
      {
        query: body => ({
          url: '/reports/generate/debt-status-report',
          method: 'POST',
          body,
        }),
        invalidatesTags: [{ type: 'Report', id: 'LIST' }],
      },
    ),

    refreshReport: builder.mutation<Report, string>({
      query: id => ({
        url: `/reports/${id}/refresh`,
        method: 'POST',
      }),
      invalidatesTags: [{ type: 'Report', id: 'LIST' }],
    }),
  }),
});

export const {
  useGetReportsQuery,
  useGenerateDebtLedgerMutation,
  useGeneratePaymentLedgerMutation,
  useGenerateDebtStatusReportMutation,
  useRefreshReportMutation,
} = reportApi;

export default reportApi;
