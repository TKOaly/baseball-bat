import { format } from 'date-fns';
import { useLocation } from 'wouter';
import { Email } from '@bbat/common/src/types';
import { useSendEmailsMutation } from '../api/email';
import { Table } from '@bbat/ui/table';

export interface Props {
  emails: Email[];
}

export const EmailList = (props: Props) => {
  const [, setLocation] = useLocation();
  const [sendEmails] = useSendEmailsMutation();

  return (
    <Table
      rows={(props.emails ?? []).map(e => ({ ...e, key: e.id })) ?? []}
      columns={[
        {
          name: 'Recipient',
          getValue: 'recipient',
        },
        {
          name: 'Subject',
          getValue: 'subject',
        },
        {
          name: 'Created',
          getValue: 'createdAt',
          render: value => value && format(new Date(value), 'dd.MM.yyyy HH:mm'),
        },
        {
          name: 'Sent',
          getValue: 'sentAt',
          render: value => value && format(new Date(value), 'dd.MM.yyyy HH:mm'),
        },
        {
          name: 'Status',
          getValue: row => {
            if (row.draft) {
              return 'Draft';
            }

            return 'Pending';
          },
        },
      ]}
      selectable={true}
      actions={[
        {
          key: 'send',
          text: 'Send',
          onSelect: async emails => {
            await sendEmails(emails.map(e => e.id));
          },
        },
      ]}
      onRowClick={row => setLocation(`/admin/emails/${row.id}`)}
    />
  );
};
