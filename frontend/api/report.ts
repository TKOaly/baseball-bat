import rtkApi from './rtk-api';
import { Report } from '../../common/types';

const reportApi = rtkApi.injectEndpoints({
  endpoints: builder => ({
    getReports: builder.query<Report[], void>({
      query: () => '/reports',
    }),
  }),
});

export const {
  useGetReportsQuery,
} = reportApi;

export default reportApi;

