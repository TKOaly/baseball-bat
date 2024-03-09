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
        <div className="mb-4 flex items-center">
          <input
            type="checkbox"
            checked={ignoreCooldown}
            className="h-4 w-4 rounded border-gray-300 border-gray-600 bg-gray-100 bg-gray-700 text-blue-600 ring-offset-gray-800 focus:ring-2 focus:ring-blue-500 focus:ring-blue-600"
            onClick={evt => setIgnoreCooldown(evt.currentTarget.checked)}
            id="send-reminders-dialog-cooldown-checkbox"
          />
          <label
            htmlFor="send-reminders-dialog-cooldown-checkbox"
            className="ml-2 text-sm font-medium text-gray-300 text-gray-900"
          >
            Ignore notice cooldown (1 month)
          </label>
        </div>
        <div className="flex items-center">
          <input
            type="checkbox"
            checked={!send}
            className="h-4 w-4 rounded border-gray-300 border-gray-600 bg-gray-100 bg-gray-700 text-blue-600 ring-offset-gray-800 focus:ring-2 focus:ring-blue-500 focus:ring-blue-600"
            onClick={evt => setSend(!evt.currentTarget.checked)}
            id="send-reminders-dialog-send-checkbox"
          />
          <label
            htmlFor="send-reminders-dialog-send-checkbox"
            className="ml-2 text-sm font-medium text-gray-300 text-gray-900"
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
