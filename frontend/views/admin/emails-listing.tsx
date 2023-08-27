import { useGetEmailsQuery } from '../../api/email';
import { EmailList } from '../../components/email-list';

export const EmailsListing = () => {
  const { data: emails } = useGetEmailsQuery(null);

  return (
    <>
      <h1 className="text-2xl mt-10 mb-5">Emails</h1>

      <EmailList emails={emails ?? []} />
    </>
  );
};
