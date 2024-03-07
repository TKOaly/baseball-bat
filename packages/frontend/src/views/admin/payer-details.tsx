import { Breadcrumbs } from '@bbat/ui/breadcrumbs';
import payersApi, {
  useGetPayerDebtsQuery,
  useGetPayerEmailsQuery,
  useGetPayerQuery,
  useSendPayerDebtReminderMutation,
} from '../../api/payers';
import { DebtList } from '../../components/infinite-debt-list';
import {
  Page,
  Header,
  Title,
  Section,
  TextField,
  Field,
  SectionContent,
  Actions,
  ActionButton,
  BadgeField,
  LinkField,
} from '../../components/resource-page/resource-page';
import * as dfns from 'date-fns';
import { useDialog } from '../../components/dialog';
import { RemindersSentDialog } from '../../components/dialogs/reminders-sent-dialog';
import { SendRemindersDialog } from '../../components/dialogs/send-reminders-dialog';
import { MergeProfilesDialog } from '../../components/dialogs/merge-profiles-dialog';
import { internalIdentity } from '@bbat/common/src/types';
import { Link, RouteComponentProps, useLocation } from 'wouter';
import { skipToken } from '@reduxjs/toolkit/dist/query/react';

type Props = RouteComponentProps<{ id: string }>;

export const PayerDetails = ({ params }: Props) => {
  const [, setLocation] = useLocation();
  const { data: payer } = useGetPayerQuery(params.id);
  const { data: emails } = useGetPayerEmailsQuery(params.id);
  const { data: debts } = useGetPayerDebtsQuery({
    id: params.id,
    includeDrafts: true,
  });
  const { data: mergedPayer } = useGetPayerQuery(
    payer?.mergedTo?.value ?? skipToken,
  );
  const [sendPayerDebtReminder] = useSendPayerDebtReminderMutation();
  const showRemindersSentDialog = useDialog(RemindersSentDialog);
  const showSendRemindersDialog = useDialog(SendRemindersDialog);
  const showMergeProfilesDialog = useDialog(MergeProfilesDialog);

  if (!payer || !emails) return 'Loading...';

  const overdue = (debts?.result ?? []).filter(
    d => d.dueDate && dfns.isPast(d.dueDate),
  );

  const handleSendReminder = async () => {
    const options = await showSendRemindersDialog({});

    if (!options) {
      return;
    }

    const res = await sendPayerDebtReminder({
      payerId: params.id,
      send: options.send,
      ignoreCooldown: options.ignoreCooldown,
    });

    if ('data' in res) {
      await showRemindersSentDialog({
        payerCount: res.data.payerCount,
        debtCount: res.data.messageCount,
      });
    }
  };

  return (
    <Page>
      <Header>
        <Title>
          <Breadcrumbs
            linkComponent={Link}
            segments={[
              { url: '/admin/payers', text: 'Payers' },
              payer?.name ?? '',
            ]}
          />
        </Title>
        <Actions>
          {overdue.length == 0 && (
            <ActionButton secondary onClick={handleSendReminder}>
              Send Reminder
            </ActionButton>
          )}
          <ActionButton
            secondary
            onClick={async () => {
              const result = await showMergeProfilesDialog({
                secondaryId: internalIdentity(params.id),
              });

              if (result !== null) {
                setLocation(`/admin/payers/${result.primaryId}`);
              }
            }}
          >
            Merge
          </ActionButton>
          <ActionButton
            secondary
            onClick={() => setLocation(`/admin/payers/${payer.id.value}/edit`)}
          >
            Edit
          </ActionButton>
        </Actions>
      </Header>
      <Section title="Details" columns={2}>
        <TextField label="Name" value={payer?.name} />
        <Field label="Emails">
          {emails.map(email => (
            <span
              title={`Source: ${email.source}`}
              className={`rounded-[3pt] text-sm py-0.5 px-2 ${
                {
                  primary: 'bg-blue-500 text-white',
                  default: 'bg-gray-500 text-black',
                  disabled: 'bg-gray-200 text-gray-500',
                }[email.priority]
              }`}
              key={email.email}
            >
              {email.email}
            </span>
          ))}
        </Field>
        <BadgeField
          label="Status"
          text={payer?.disabled ? 'Disabled' : 'Active'}
          color={payer?.disabled ? 'red' : 'gray'}
        />
        {mergedPayer && (
          <LinkField
            label="Merged to"
            text={mergedPayer.name}
            to={`/admin/payers/${payer?.mergedTo?.value}`}
          />
        )}
      </Section>
      <Section title="Debts">
        <SectionContent>
          <DebtList
            endpoint={payersApi.endpoints.getPayerDebts}
            query={{ id: params.id, limit: 30 }}
          />
        </SectionContent>
      </Section>
    </Page>
  );
};
