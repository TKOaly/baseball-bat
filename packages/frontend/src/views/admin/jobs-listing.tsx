import { format, formatDuration } from 'date-fns';
import { useLocation } from 'wouter';
import { useGetJobsQuery } from '../../api/jobs';
import { Table } from '@bbat/ui/table';

export const JobsListing = () => {
  const { data: jobs } = useGetJobsQuery(undefined, { pollingInterval: 100 });
  const [, setLocation] = useLocation();

  return (
    <div>
      <h1 className="mb-5 mt-10 text-2xl">Jobs</h1>
      <Table
        persist="jobs"
        rows={(jobs ?? []).map(job => ({ ...job, key: job.id }))}
        onRowClick={job => setLocation(`/admin/jobs/${job.queue}/${job.id}`)}
        columns={[
          {
            name: 'Time',
            getValue: job => job.time,
            render: time => format(time, 'dd.MM.yyyy HH:mm:ss'),
          },
          {
            name: 'Name',
            getValue: 'name',
            render: (value, _, depth) => (
              <div style={{ paddingLeft: `${depth * 1.5}em` }}>{value}</div>
            ),
          },
          {
            name: 'Duration',
            getValue: job => formatDuration({ seconds: job.duration / 1000 }),
          },
          {
            name: 'Children',
            getValue: job => job.children.length,
          },
          {
            name: 'Progress',
            getValue: job => (job.progress === 0 ? 2 : job.progress),
            render: (v, job) => {
              const value = v === 2 ? 0 : v;

              if (job.status === 'waiting') {
                return 'Waiting';
              }

              const color =
                (
                  {
                    failed: 'bg-red-400',
                    completed: 'bg-green-400',
                    delayed: 'bg-yellow-400',
                  } as Record<string, string>
                )[job.status] ?? 'bg-green-400';

              return (
                <div className="w-full">
                  <div className="text-xs">{(value * 100).toFixed(0)}%</div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
                    <div
                      className={`h-full ${color}`}
                      style={{ width: `${(value * 100).toFixed()}%` }}
                    />
                  </div>
                </div>
              );
            },
          },
        ]}
      />
    </div>
  );
};
