import { useState } from 'react';
import { BankTransaction } from '../../../common/types';
import { useRegisterTransactionMutation } from '../../api/payments';
import { Button, DisabledButton, SecondaryButton } from '../button';
import {
  DialogBase,
  DialogHeader,
  DialogContent,
  DialogFooter,
} from '../dialog';
import { ResourceSelectField } from '../resource-select-field';

export type Props = {
  transactions: BankTransaction[];
  onClose: () => void;
};

export const TransactionRegistrationDialog = ({
  transactions,
  onClose,
}: Props) => {
  const [selected, setSelected] = useState(null);
  const [registerTransaction] = useRegisterTransactionMutation();

  const handleRegistration = async () => {
    const result = await registerTransaction({
      transactionId: transactions[0].id,
      paymentId: selected,
    });

    if ('data' in result) {
      onClose();
    }
  };

  return (
    <DialogBase onClose={() => onClose()}>
      <DialogHeader>Register transactions manually</DialogHeader>
      <DialogContent>
        <p className="mb-2">
          Select a payment against which to register this transaction:
        </p>
        <ResourceSelectField
          type="payment"
          value={selected ? { type: 'payment', id: selected } : null}
          onChange={(_, { id }) => setSelected(id)}
        />
      </DialogContent>
      <DialogFooter>
        <SecondaryButton onClick={() => onClose()}>Cancel</SecondaryButton>
        {selected ? (
          <Button onClick={() => handleRegistration()}>Register</Button>
        ) : (
          <DisabledButton>Register</DisabledButton>
        )}
      </DialogFooter>
    </DialogBase>
  );
};
