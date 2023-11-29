import {
  DialogBase,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from '../../components/dialog';
import { Button, SecondaryButton } from '@bbat/ui/button';
import { useState } from 'react';

type Props = {
  onClose: (_: { send: boolean; ignoreCooldown: boolean } | null) => void;
  debtCount?: number;
};

export const SendRemindersDialog = ({ onClose, debtCount }: Props) => {
  const [send, setSend] = useState(false);
  const [ignoreCooldown, setIgnoreCooldown] = useState(false);

  return (
    <DialogBase onClose={() => onClose(null)}>
      <DialogHeader>Send payment notices</DialogHeader>
      <DialogContent>
        <p className="mb-4 text-sm">
          You are about to send payment notices for{' '}
          {debtCount === undefined ? 'an unspecified amount of' : debtCount}{' '}
          debts. Check your preferences below and click {'"'}Send Notices{'"'}.
        </p>
        <div className="flex items-center mb-4">
          <input
            type="checkbox"
            checked={ignoreCooldown}
            className="w-4 h-4 text-blue-600 bg-gray-100 rounded border-gray-300 focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
            onClick={evt => setIgnoreCooldown(evt.currentTarget.checked)}
            id="send-reminders-dialog-cooldown-checkbox"
          />
          <label
            htmlFor="send-reminders-dialog-cooldown-checkbox"
            className="ml-2 text-sm font-medium text-gray-900 dark:text-gray-300"
          >
            Ignore notice cooldown (1 month)
          </label>
        </div>
        <div className="flex items-center">
          <input
            type="checkbox"
            checked={!send}
            className="w-4 h-4 text-blue-600 bg-gray-100 rounded border-gray-300 focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
            onClick={evt => setSend(!evt.currentTarget.checked)}
            id="send-reminders-dialog-send-checkbox"
          />
          <label
            htmlFor="send-reminders-dialog-send-checkbox"
            className="ml-2 text-sm font-medium text-gray-900 dark:text-gray-300"
          >
            Save messages as drafts
          </label>
        </div>
      </DialogContent>
      <DialogFooter>
        <SecondaryButton onClick={() => onClose(null)}>Close</SecondaryButton>
        <Button onClick={() => onClose({ send, ignoreCooldown })}>
          Send Notices
        </Button>
      </DialogFooter>
    </DialogBase>
  );
};
