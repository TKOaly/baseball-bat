import { parseISO } from 'date-fns/parseISO';
import rtkApi from './rtk-api';
import { Job, JobState, PaginationQueryResponse } from '@bbat/common/types';
import { createPaginatedQuery } from './pagination';

type ResponseJob = {
  id: string;
  type: string;
  title: string | null;
  state: JobState;
  data: string;
  result: string;
  createdAt: string;
  finishedAt: string | null;
  startedAt: string | null;
  retries: number;
  maxRetries: number;
  delayedUntil: string | null;
  retryDelay: number;
  concurrencyLimit: number | null;
  limitClass: string;
  ratelimit: number | null;
  ratelimitPeriod: number | null;
  concurrency: number;
  rate: number;
  nextPoll: string | null;
  progress: number;
};

const transformJob = (job: ResponseJob): Job => ({
  id: job.id,
  state: job.state,
  type: job.type,
  title: job.title,
  data: job.data,
  result: job.result,
  createdAt: parseISO(job.createdAt),
  finishedAt: job.finishedAt ? parseISO(job.finishedAt) : null,
  startedAt: job.startedAt ? parseISO(job.startedAt) : null,
  retries: job.retries,
  maxRetries: job.maxRetries,
  retryDelay: job.retryDelay,
  delayedUntil: job.delayedUntil ? parseISO(job.delayedUntil) : null,
  concurrencyLimit: job.concurrencyLimit,
  limitClass: job.limitClass,
  ratelimit: job.ratelimit,
  rate: job.rate,
  concurrency: job.concurrency,
  ratelimitPeriod: job.ratelimitPeriod,
  nextPoll: job.nextPoll ? parseISO(job.nextPoll) : null,
  progress: job.progress,
});

const jobsApi = rtkApi.injectEndpoints({
  endpoints: builder => ({
    getJobs: createPaginatedQuery<Job>()(builder, {
      query: () => '/jobs/list',
      transformResponse: (response: PaginationQueryResponse<ResponseJob>) => ({
        ...response,
        result: response.result.map(transformJob),
      }),
    }),

    getJob: builder.query<Job, { id: string }>({
      query: ({ id }) => `/jobs/${id}`,
      transformResponse: transformJob,
    }),
  }),
});

export const { useGetJobsQuery, useGetJobQuery } = jobsApi;
export default jobsApi;
