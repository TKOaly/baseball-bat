import format from 'date-fns/format';
import { useLocation } from 'wouter';
import { useSendEmailsMutation } from '../api/email';
import {
  InfiniteTable,
  Props as InfiniteTableProps,
  PaginatedBaseQuery,
} from './infinite-table';
import { Email } from '@bbat/common/src/types';

export type Props<Q extends PaginatedBaseQuery> = Omit<
  InfiniteTableProps<Email, Q>,
  'columns' | 'actions'
>;

export const EmailList = <Q extends PaginatedBaseQuery>(props: Props<Q>) => {
  const [, setLocation] = useLocation();
  const [sendEmails] = useSendEmailsMutation();

  return (
    <InfiniteTable
      {...props}
      columns={[
        {
          name: 'Recipient',
          key: 'recipient',
          getValue: 'recipient',
        },
        {
          name: 'Subject',
          key: 'subject',
          getValue: 'subject',
        },
        {
          name: 'Created',
          key: 'created_at',
          getValue: 'createdAt',
          render: value => value && format(new Date(value), 'dd.MM.yyyy HH:mm'),
        },
        {
          name: 'Sent',
          key: 'sent_at',
          getValue: 'sentAt',
          render: value => value && format(new Date(value), 'dd.MM.yyyy HH:mm'),
        },
        {
          name: 'Status',
          key: 'draft',
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
