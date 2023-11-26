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

type Props = {
  onClose: (_: { name: string } | null) => void;
};

export const AddTagDialog = ({ onClose }: Props) => {
  const [name, setName] = useState('');

  return (
    <DialogBase onClose={() => onClose(null)}>
      <DialogHeader>Add tag</DialogHeader>
      <DialogContent>
        <p className="mb-4 text-sm">Create a new tag for the selected debts.</p>
        <div className="flex items-center mb-4">
          <StandaloneInputGroup
            name="tag-name"
            label="Tag name"
            component={TextField}
            onChange={evt => setName(evt.target.value)}
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
