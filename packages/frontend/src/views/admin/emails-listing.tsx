import emailApi from '../../api/email';
import { EmailList } from '../../components/email-list';

export const EmailsListing = () => {
  return (
    <>
      <h1 className="text-2xl mt-10 mb-5">Emails</h1>

      <EmailList endpoint={emailApi.endpoints.getEmails} />
    </>
  );
};
