import {
  DialogBase,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from '../../components/dialog';
import { Button, SecondaryButton } from '@bbat/ui/button';
import { useState } from 'react';

interface InputlikeProps<V = string> {
  value: V;
  onChange: (evt: { target: { value: V } }) => void;
}

type Props<V> = {
  onClose: (result: { changed: boolean; value: V }) => void;
  columnKey: string;
  columnTitle: string;
  value: V;
  inputComponent: React.FC<InputlikeProps<V>>;
};

export function SetColumnDefaultValueDialog<V>({
  onClose,
  columnTitle,
  value: initialValue,
  inputComponent: InputComponent,
}: Props<V>) {
  const [value, setValue] = useState(initialValue);

  return (
    <DialogBase onClose={() => onClose({ changed: false, value })}>
      <DialogHeader>
        Set default value for column {'"'}
        {columnTitle}
        {'"'}
      </DialogHeader>
      <DialogContent>
        <InputComponent
          value={value}
          onChange={evt => setValue(evt.target.value)}
        />
      </DialogContent>
      <DialogFooter>
        <SecondaryButton onClick={() => onClose({ changed: false, value })}>
          Close
        </SecondaryButton>
        <SecondaryButton
          onClick={() => onClose({ changed: true, value: null })}
        >
          Clear
        </SecondaryButton>
        <Button onClick={() => onClose({ changed: true, value })}>
          Set value
        </Button>
      </DialogFooter>
    </DialogBase>
  );
}
