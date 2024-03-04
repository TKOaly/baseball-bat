import {
  DialogBase,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from '../../components/dialog';
import { Button, SecondaryButton } from '@bbat/ui/button';
import { useState } from 'react';
import { TextField } from '@bbat/ui/text-field';
import { StandaloneInputGroup } from '../input-group';
import { EuroValue, euro } from '@bbat/common/src/currency';
import { EuroField } from '../euro-field';

type Props = {
  onClose: (_: { name: string; amount: EuroValue } | null) => void;
};

export const CustomComponentColumnDialog = ({ onClose }: Props) => {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState(euro(0));

  return (
    <DialogBase onClose={() => onClose(null)}>
      <DialogHeader>Create a custom component column</DialogHeader>
      <DialogContent>
        <div className="flex items-center mb-4 gap-6 mx-4">
          <StandaloneInputGroup
            name="name"
            label="Component name"
            component={TextField}
            onChange={evt => setName(evt.target.value)}
            value={name}
          />
          <StandaloneInputGroup
            name="amount"
            label="Amount"
            component={EuroField}
            onChange={evt => setAmount(euro(evt.target.value ?? 0))}
            value={amount.value / 100}
          />
        </div>
      </DialogContent>
      <DialogFooter>
        <SecondaryButton onClick={() => onClose(null)}>Close</SecondaryButton>
        <Button onClick={() => onClose({ name, amount })}>Create</Button>
      </DialogFooter>
    </DialogBase>
  );
};
