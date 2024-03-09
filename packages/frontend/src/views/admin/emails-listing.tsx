import emailApi from '../../api/email';
import { EmailList } from '../../components/email-list';

export const EmailsListing = () => {
  return (
    <>
      <h1 className="mb-5 mt-10 text-2xl">Emails</h1>

      <EmailList endpoint={emailApi.endpoints.getEmails} />
    </>
  );
};
