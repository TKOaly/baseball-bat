import { useGetEmailsQuery, useSendEmailsMutation } from '../../api/email';
import { TableView } from '../../components/table-view';
import { useLocation } from 'wouter';
import { format } from 'date-fns';
import { EmailList } from '../../components/email-list';

export const EmailsListing = () => {
  const [, setLocation] = useLocation();
  const { data: emails } = useGetEmailsQuery(null);
  const [sendEmails] = useSendEmailsMutation();

  return (
    <>
      <h1 className="text-2xl mt-10 mb-5">Emails</h1>

      <EmailList emails={emails ?? []} />
    </>
  );
};
