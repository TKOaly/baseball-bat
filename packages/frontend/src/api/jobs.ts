import parseISO from 'date-fns/parseISO';
import rtkApi from './rtk-api';
import { Job, JobStatus } from '@bbat/common/types';

type ResponseJob = {
  name: string;
  id: string;
  status: JobStatus;
  time: string;
  processedAt: string;
  finishedAt: string | null;
  duration: number;
  children: ResponseJob[];
  queue: string;
  returnValue: any;
  progress: number;
};

const transformJob = (job: ResponseJob): Job => ({
  ...job,
  time: parseISO(job.time),
  processedAt: parseISO(job.processedAt),
  finishedAt: job.finishedAt ? parseISO(job.finishedAt) : null,
  children: job.children.map(transformJob),
});

const jobsApi = rtkApi.injectEndpoints({
  endpoints: builder => ({
    getJobs: builder.query<Job[], void>({
      query: () => '/jobs/list',
      transformResponse: (response: ResponseJob[]): Job[] =>
        response.map(transformJob),
    }),

    getJob: builder.query<Job, { queue: string; id: string }>({
      query: ({ queue, id }) => `/jobs/queue/${queue}/${id}`,
      transformResponse: transformJob,
    }),
  }),
});

export const { useGetJobsQuery, useGetJobQuery } = jobsApi;
