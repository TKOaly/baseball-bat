import {
  DialogBase,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from '../../components/dialog';
import { Button } from '@bbat/ui/button';
import { ReactNode } from 'react';
import { AlertTriangle } from 'react-feather';

type Props = {
  onClose: () => void
  title: string
  content: ReactNode
}

export const ErrorDialog = ({ onClose, title, content }: Props) => {
  return (
    <DialogBase onClose={() => onClose()}>
      <DialogHeader>
        <AlertTriangle className="text-red-600" />
        {title}
      </DialogHeader>
      <DialogContent>{content}</DialogContent>
      <DialogFooter>
        <Button onClick={() => onClose()}>Close</Button>
      </DialogFooter>
    </DialogBase>
  );
};
