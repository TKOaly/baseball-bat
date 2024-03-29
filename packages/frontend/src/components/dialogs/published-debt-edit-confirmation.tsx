import {
  DialogBase,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from '../../components/dialog';
import { Button, SecondaryButton } from '@bbat/ui/button';

type Props = {
  onClose: (value: boolean) => void;
};

export const PublishedDebtEditConfirmation = ({ onClose }: Props) => {
  return (
    <DialogBase
      onClose={() => onClose(false)}
      data-cy="published-debt-edit-confirmation-dialog"
    >
      <DialogHeader>This debt has been published</DialogHeader>
      <DialogContent>
        You are about to edit a published debt. Are you sure you want to do
        this?
      </DialogContent>
      <DialogFooter>
        <SecondaryButton onClick={() => onClose(false)}>Cancel</SecondaryButton>
        <Button onClick={() => onClose(true)}>Continue</Button>
      </DialogFooter>
    </DialogBase>
  );
};
