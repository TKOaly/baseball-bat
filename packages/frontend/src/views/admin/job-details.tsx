import { format } from 'date-fns/format';
import {
  useGetJobQuery,
  useRetryJobMutation,
  useTerminateJobMutation,
} from '../../api/jobs';
import { RouteComponentProps, Link } from 'wouter';
import * as t from 'io-ts';
import { Breadcrumbs } from '@bbat/ui/breadcrumbs';
import {
  Page,
  Header,
  Title,
  Section,
  TextField,
  DateField,
  BadgeField,
  BadgeColor,
  Field,
  LinkField,
  Actions,
  ActionButton,
} from '../../components/resource-page/resource-page';
import { toNullable, fromEither } from 'fp-ts/lib/Option';
import { formatDuration, intervalToDuration } from 'date-fns';
import { useGetPayerQuery } from '../../api/payers';
import { skipToken } from '@reduxjs/toolkit/query';

type Props = RouteComponentProps<{
  id: string;
  queue: string;
}>;

const errorDetailsType = t.type({
  name: t.string,
  message: t.string,
  traceId: t.union([t.null, t.string]),
});

export const JobDetails = (props: Props) => {
  const { id } = props.params;
  const { data: job } = useGetJobQuery({ id });
  const { data: triggeredBy } = useGetPayerQuery(
    job?.triggeredBy?.value ?? skipToken,
  );
  const [terminateJob] = useTerminateJobMutation();
  const [retryJob] = useRetryJobMutation();

  if (!job) {
    return <div />;
  }

  let stateColor: BadgeColor = 'gray';
  let stateLabel = job.state as string;

  if (job.state === 'succeeded') {
    stateColor = 'green';
    stateLabel = 'Finished';
  } else if (job.state === 'failed') {
    stateColor = 'red';
    stateLabel = 'Failed';
  } else if (job.state === 'processing') {
    stateColor = 'blue';
    stateLabel = 'Running';
  }

  const errorDetails = toNullable(
    fromEither(errorDetailsType.decode(job.result)),
  );

  return (
    <Page>
      <Header>
        <Title>
          <Breadcrumbs
            linkComponent={Link}
            segments={[
              { text: 'Jobs', url: '/admin/jobs' },
              job.title ?? job.id,
            ]}
          />
        </Title>
        <Actions>
          {job.state === 'processing' && (
            <ActionButton
              onClick={async () => {
                terminateJob({ id: job.id });
              }}
            >
              Terminate
            </ActionButton>
          )}
          {job.state === 'failed' && (
            <ActionButton
              onClick={async () => {
                retryJob({ id: job.id });
              }}
            >
              Retry
            </ActionButton>
          )}
        </Actions>
      </Header>
      <Section title="Details" columns={2}>
        <TextField label="Title" value={job.title ?? 'Untitled'} />
        <TextField label="Type" value={job.type} />
        {(job.triggeredBy && (
          <LinkField
            label="Triggered by"
            text={triggeredBy?.name ?? ''}
            to={`/admin/payers/${job.triggeredBy.value}`}
          />
        )) || <TextField label="Triggered by" value="System" />}
        <DateField
          time
          label="Created at"
          value={job.createdAt}
          format="d.m.y HH:mm:ss"
        />
        <DateField
          time
          label="Started at"
          value={job?.startedAt ?? ''}
          format="d.m.y HH:mm:ss"
        />
        <TextField
          label="Finished at"
          value={
            job.finishedAt
              ? format(job.finishedAt, 'd.m.y HH:mm:ss')
              : 'Not finished'
          }
        />
        <BadgeField label="State" text={stateLabel} color={stateColor} />
        <TextField
          label="Retries"
          value={`Attempt ${job.retries + 1} out of ${job.maxRetries}${job.state === 'pending' && job.delayedUntil ? ` (Next attempt in ${formatDuration(intervalToDuration({ start: new Date(), end: job.delayedUntil }))})` : ''}`}
        />
        <TextField label="Limit class" value={job.limitClass} />
        {job.ratelimit && (
          <TextField
            label="Rate"
            value={`${job.rate} out of ${job.ratelimit} allowed jobs within ${job.ratelimitPeriod} seconds`}
          />
        )}
        <TextField
          label="Concurrency"
          value={`${job.concurrency} concurrent jobs${job.concurrencyLimit ? ` out of ${job.concurrencyLimit} allowed` : ''}`}
        />
        {job.state === 'failed' && errorDetails && (
          <Field fullWidth label="Error">
            <div className="rounded-sm border border-gray-200 bg-gray-100 p-2">
              <strong className="block text-gray-800">
                {errorDetails.name}
              </strong>
              <p>{errorDetails.message}</p>
              <div className="mt-2">
                <strong className="text-gray-700">Trace ID:</strong>{' '}
                {errorDetails.traceId}
              </div>
            </div>
          </Field>
        )}
      </Section>
    </Page>
  );
};
