import { Button, SecondaryButton } from '@bbat/ui/button';
import debtApi, { useSendAllRemindersMutation } from '../../api/debt';
import { useSearch } from 'wouter';
import { useLocation } from 'wouter';
import { useDialog } from '../../components/dialog';
import { RemindersSentDialog } from '../../components/dialogs/reminders-sent-dialog';
import { SendRemindersDialog } from '../../components/dialogs/send-reminders-dialog';
import { DebtList } from '../../components/debt-list';

export const DebtListing = () => {
  const search = useSearch();
  const tag = new URLSearchParams(search).get('tag');

  const [sendAllReminders] = useSendAllRemindersMutation();
  const showRemindersSentDialog = useDialog(RemindersSentDialog);
  const showSendRemindersDialog = useDialog(SendRemindersDialog);
  const [, setLocation] = useLocation();

  const handleSendAllReminders = async () => {
    const options = await showSendRemindersDialog({});

    if (!options) {
      return;
    }

    const result = await sendAllReminders({ ...options, debts: null });

    if ('data' in result) {
      showRemindersSentDialog({
        payerCount: result.data.payerCount,
        debtCount: result.data.messageCount,
      });
    }
  };

  return (
    <>
      <h1 className="mb-5 mt-10 text-2xl">Debts {tag && `(Tag: "${tag}")`}</h1>
      <p className="text-md mb-7 text-gray-800">
        {tag
          ? `Here are listed all debts associated with the tag "${tag}".`
          : 'Here are listed all individual debts in the system.'}{' '}
        A debt corresponds usually to a single event registration, but may not
        have one-to-one mapping to a payment.
      </p>
      <div className="mb-7 flex gap-3">
        <Button onClick={() => setLocation('/admin/debts/create')}>
          Create
        </Button>
        <SecondaryButton
          onClick={() => setLocation('/admin/debts/create-debts-csv')}
        >
          Mass Creation
        </SecondaryButton>
        <SecondaryButton onClick={handleSendAllReminders}>
          Send all reminders
        </SecondaryButton>
      </div>
      <DebtList endpoint={debtApi.endpoints.getDebts} />
    </>
  );
};
