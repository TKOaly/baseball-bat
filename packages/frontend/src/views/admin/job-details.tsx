import { format, formatDuration } from 'date-fns';
import { useLocation } from 'wouter';
import { useGetJobQuery } from '../../api/jobs';
import { RouteComponentProps, Link } from 'wouter';
import { Breadcrumbs } from '@bbat/ui/breadcrumbs';
import { Table } from '@bbat/ui/table';
import {
  Page,
  Header,
  Title,
  Section,
  TextField,
  DateField,
} from '../../components/resource-page/resource-page';
import * as t from 'io-ts';
import * as E from 'fp-ts/lib/Either';
import { pipe } from 'fp-ts/lib/function';

type Props = RouteComponentProps<{
  id: string;
  queue: string;
}>;

const returnValueType = t.type({
  message: t.string,
});

export const JobDetails = (props: Props) => {
  const { queue, id } = props.params;
  const { data: job } = useGetJobQuery({ queue, id }, { pollingInterval: 500 });
  const [, setLocation] = useLocation();

  if (!job) {
    return <div />;
  }

  return (
    <Page>
      <Header>
        <Title>
          <Breadcrumbs
            linkComponent={Link}
            segments={[
              { text: 'Jobs', url: '/admin/jobs' },
              job?.name ?? 'Loading...',
            ]}
          />
        </Title>
      </Header>
      <Section title="Details" columns={2}>
        <TextField label="Name" value={job.name} />
        <DateField time label="Created at" value={job.time} />
        <DateField time label="Processed at" value={job?.processedAt ?? ''} />
        <TextField
          label="Finished at"
          value={
            job.finishedAt
              ? format(job.finishedAt, 'd.m.y H:m')
              : 'Not finished'
          }
        />
        <TextField
          label="Duration"
          value={formatDuration({ seconds: job.duration / 1000 })}
        />
        <TextField label="Status" value={job.status} />
        {job?.status === 'failed' &&
          pipe(
            job.returnValue,
            returnValueType.decode,
            E.fold(
              () => null,
              ({ message }) => (
                <TextField label="Error Message" value={message} />
              ),
            ),
          )}
      </Section>
      <Section title="Children">
        <Table
          rows={(job?.children ?? []).map(job => ({ ...job, key: job.id }))}
          onRowClick={job => setLocation(`/admin/jobs/${job.queue}/${job.id}`)}
          columns={[
            {
              name: 'Time',
              getValue: job => new Date(job.time),
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

                return (
                  <div className="w-full">
                    <div className="text-xs">{(value * 100).toFixed(0)}%</div>
                    <div className="h-1.5 bg-gray-200 w-full relative rounded-full overflow-hidden">
                      <div
                        className={`h-full ${
                          job.status === 'failed'
                            ? 'bg-red-400'
                            : 'bg-green-400'
                        }`}
                        style={{ width: `${(value * 100).toFixed()}%` }}
                      />
                    </div>
                  </div>
                );
              },
            },
          ]}
        />
      </Section>
    </Page>
  );
};
