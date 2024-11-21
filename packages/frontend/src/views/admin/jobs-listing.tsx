import { format } from 'date-fns/format';
import { useLocation } from 'wouter';
import jobsApi from '../../api/jobs';
import { InfiniteTable } from '../../components/infinite-table';
import { cva } from 'class-variance-authority';
import { PropsWithChildren } from 'react';
import { formatDuration, intervalToDuration } from 'date-fns';

const badgeCva = cva('mr-1 rounded-[2pt] px-1 py-0.5 text-xs font-bold', {
  variants: {
    color: {
      gray: 'bg-gray-300 text-gray-700',
      green: 'bg-green-600 text-green-50',
      blue: 'bg-blue-200 text-blue-600',
      orange: 'bg-orange-200 text-orange-600',
      red: 'bg-red-600 text-red-50',
    },
  },
});

type BadgeColor = 'green' | 'blue' | 'orange' | 'red' | 'gray';

const Badge = ({
  children,
  color,
  className,
}: PropsWithChildren<{ color: BadgeColor; className?: string }>) => (
  <span className={badgeCva({ color, className })}>{children}</span>
);

export const JobsListing = () => {
  const [, setLocation] = useLocation();

  return (
    <div>
      <h1 className="mb-5 mt-10 text-2xl">Jobs</h1>
      <InfiniteTable
        endpoint={jobsApi.endpoints.getJobs}
        onRowClick={job => setLocation(`/admin/jobs/${job.id}`)}
        persist="jobs"
        initialSort={{ column: 'Created', direction: 'desc' }}
        columns={[
          {
            name: 'Created',
            getValue: job => job.createdAt,
            render: time => format(time, 'dd.MM.yyyy HH:mm:ss'),
            key: 'created_at',
          },
          {
            name: 'Type',
            getValue: 'type',
            key: 'type',
            render: value => <Badge color="gray">{value}</Badge>,
          },
          {
            name: 'Title',
            getValue: 'title',
            key: 'title',
          },
          {
            name: 'State',
            getValue: 'state',
            key: 'state',
            render: value => {
              const variants: Record<
                string,
                { label: string; color: BadgeColor }
              > = {
                pending: { label: 'Pending', color: 'gray' },
                scheduled: { label: 'Scheduled', color: 'gray' },
                processing: { label: 'Running', color: 'orange' },
                failed: { label: 'Failed', color: 'red' },
                succeeded: { label: 'Finished', color: 'green' },
              };

              const { color, label } = variants[value] ?? {
                label: value,
                color: 'gray',
              };

              return <Badge color={color}>{label}</Badge>;
            },
          },
          {
            name: 'Duration',
            getValue: row => {
              try {
                if (row.startedAt === null) return '';

                const end = row.finishedAt ?? new Date();

                const duration = formatDuration(
                  intervalToDuration({
                    start: row.startedAt,
                    end,
                  }),
                );

                return duration !== '' ? duration : 'Under 1 second';
              } catch (err) {
                return String(err);
              }
            },
          },
          {
            name: 'Retries',
            getValue: 'retries',
          },
        ]}
      />
    </div>
  );
};
