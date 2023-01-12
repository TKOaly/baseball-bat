import { format, formatDuration } from "date-fns";
import { useLocation } from "wouter";
import { useGetJobQuery } from "../../api/jobs";
import { Breadcrumbs } from "../../components/breadcrumbs";
import { TableView } from "../../components/table-view";
import { Page, Header, Title, Actions, ActionButton, Section, Field, TextField, DateField, CurrencyField, LinkField, BadgeField, SectionDescription, SectionContent } from '../../components/resource-page/resource-page';

export const JobDetails = ({ queue, id }) => {
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
            segments={[
              { text: 'Jobs', url: '/admin/jobs' },
              job?.name ?? 'Loading...',
            ]}
          />
        </Title>
      </Header>
      <Section title="Details" columns={2}>
        <TextField label="Name" value={job?.name} />
        <DateField time label="Created at" value={new Date(job?.time)} />
        <DateField time label="Processed at" value={new Date(job?.processedAt)} />
        <DateField time label="Finished at" value={new Date(job?.finishedAt)} />
        <TextField label="Duration" value={formatDuration({ seconds: job.duration / 1000 })} />
        <TextField label="Status" value={job?.status} />
        { job?.status === 'failed' && <TextField label="Error Message" value={job?.returnvalue?.message} /> }
      </Section>
      <Section title="Children">
        <TableView
          rows={(job?.children ?? []).map(job => ({ ...job, key: job.id }))}
          onRowClick={(job) => setLocation(`/admin/jobs/${job.queue}/${job.id}`)}
          columns={[
            {
              name: 'Time',
              getValue: (job) => new Date(job.time),
              render: (time) => format(time, 'dd.MM.yyyy HH:mm:ss')
            },
            {
              name: 'Name',
              getValue: 'name',
              render: (value, _, depth) => (
                <div style={{ paddingLeft: `${depth * 1.5}em` }}>
                  {value}
                </div>
              )
            },
            {
              name: 'Duration',
              getValue: (job) => formatDuration({ seconds: job.duration / 1000 }),
            },
            {
              name: 'Children',
              getValue: (job) => job.children.length,
            },
            {
              name: 'Progress',
              getValue: (job) => job.progress === 0 ? 2 : job.progress,
              render: (v, job) => {
                const value = v === 2 ? 0 : v;

                if (job.status === 'waiting') {
                  return 'Waiting';
                }

                return (
                  <div className="w-full">
                    <div className="text-xs">{(value * 100).toFixed(0)}%</div>
                    <div className="h-1.5 bg-gray-200 w-full relative rounded-full overflow-hidden">
                      <div className={`h-full ${job.status === 'failed' ? 'bg-red-400' : 'bg-green-400'}`} style={{ width: `${(value * 100).toFixed()}%` }} />
                    </div>
                  </div>
                );
              },
            }
          ]}
        />
      </Section>
    </Page>
  );
}
