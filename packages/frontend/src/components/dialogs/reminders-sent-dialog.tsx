import {
  DialogBase,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from '../../components/dialog';
import { Button } from '../../components/button';

export const RemindersSentDialog = ({ onClose, payerCount, debtCount }) => {
  return (
    <DialogBase onClose={() => onClose()}>
      <DialogHeader>Reminder set</DialogHeader>
      <DialogContent>
        Reminder for {debtCount} overdue debts sent to {payerCount} payers.
      </DialogContent>
      <DialogFooter>
        <Button onClick={() => onClose()}>Close</Button>
      </DialogFooter>
    </DialogBase>
  );
};
