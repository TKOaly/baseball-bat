import rtkApi from './rtk-api';

const jobsApi = rtkApi.injectEndpoints({
  endpoints: builder => ({
    getJobs: builder.query<any, void>({
      query: () => '/jobs/list',
    }),

    getJob: builder.query<any, { queue: string; id: string }>({
      query: ({ queue, id }) => `/jobs/queue/${queue}/${id}`,
    }),
  }),
});

export const { useGetJobsQuery, useGetJobQuery } = jobsApi;
