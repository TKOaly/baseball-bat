import { useGetEmailsQuery, useSendEmailsMutation } from '../../api/email';
import { TableView } from '../../components/table-view';
import { useLocation } from 'wouter';
import { format } from 'date-fns';

export const EmailsListing = () => {
  const [, setLocation] = useLocation();
  const { data: emails } = useGetEmailsQuery(null);
  const [sendEmails] = useSendEmailsMutation();

  return (
    <>
      <h1 className="text-2xl mt-10 mb-5">Emails</h1>

      <TableView
        rows={(emails ?? []).map(e => ({ ...e, key: e.id })) ?? []}
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
            render: (value) => value && format(new Date(value), 'dd.MM.yyyy'),
          },
          {
            name: 'Sent',
            getValue: 'sentAt',
            render: (value) => value && format(new Date(value), 'dd.MM.yyyy'),
          },
          {
            name: 'Status',
            getValue: (row) => {
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
            onSelect: async (emails) => {
              await sendEmails(emails.map(e => e.id));
            },
          },
        ]}
        onRowClick={(row) => setLocation(`/admin/emails/${row.id}`)}
      />
    </>
  );
};
