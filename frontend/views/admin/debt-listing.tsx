import { Button, SecondaryButton } from '../../components/button';
import { useGetDebtsQuery, useSendAllRemindersMutation } from '../../api/debt';
import { useLocation } from 'wouter';
import { useDialog } from '../../components/dialog';
import { RemindersSentDialog } from '../../components/dialogs/reminders-sent-dialog';
import { SendRemindersDialog } from '../../components/dialogs/send-reminders-dialog';
import { DebtList } from '../../components/debt-list';

export const DebtListing = () => {
  const { data: debts } = useGetDebtsQuery(null);
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
      <h1 className="text-2xl mb-5 mt-10">Debts</h1>
      <p className="text-gray-800 mb-7 text-md">
        Here is listed all individual debts in the system.
        A debt corresponds usually to a single event registration, but may not have one-to-one mapping to a payment.
      </p>
      <div className="flex gap-3 mb-7">
        <Button onClick={() => setLocation('/admin/debts/create')}>Create</Button>
        <SecondaryButton onClick={() => setLocation('/admin/debts/create-debts-csv')}>Mass Creation</SecondaryButton>
        <SecondaryButton onClick={handleSendAllReminders}>Send all reminders</SecondaryButton>
      </div>
      <DebtList debts={debts ?? []} />
    </>
  );
};
