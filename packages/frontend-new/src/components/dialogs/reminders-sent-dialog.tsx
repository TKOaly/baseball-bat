import {
  DialogBase,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from '../../components/dialog';
import { Button } from '@bbat/ui/button';

type Props = {
  onClose: () => void
  payerCount: number
  debtCount: number
}

export const RemindersSentDialog = ({ onClose, payerCount, debtCount }: Props) => {
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
