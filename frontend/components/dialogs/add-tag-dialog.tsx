import { DialogBase, DialogContent, DialogFooter, DialogHeader } from '../../components/dialog';
import { Button, SecondaryButton } from '../../components/button';
import { useState } from 'react';
import { TextField } from '../text-field';
import { StandaloneInputGroup } from '../input-group';

type Props = {
  onClose: (_: { name: string } | null) => void,
}

export const AddTagDialog = ({ onClose }: Props) => {
  const [name, setName] = useState('');

  return (
    <DialogBase onClose={() => onClose(null)}>
      <DialogHeader>Add tag</DialogHeader>
      <DialogContent>
        <p className="mb-4 text-sm">
          Create a new tag for the selected debts.
        </p>
        <div className="flex items-center mb-4">
          <StandaloneInputGroup
            label="Tag name"
            component={TextField}
            onChange={(evt) => setName(evt.target.value)}
            value={name}
          />
        </div>
      </DialogContent>
      <DialogFooter>
        <SecondaryButton onClick={() => onClose(null)}>Close</SecondaryButton>
        <Button onClick={() => onClose({ name })}>Create</Button>
      </DialogFooter>
    </DialogBase>
  );
};
