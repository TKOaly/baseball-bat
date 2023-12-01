import { ReactNode } from 'react';
import {
  DialogBase,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from '../../components/dialog';
import { Button } from '@bbat/ui/button';

type Props = {
  onClose: () => void;
  title: string;
  content: ReactNode;
};

export const InfoDialog = ({ onClose, title, content }: Props) => {
  return (
    <DialogBase onClose={() => onClose()}>
      <DialogHeader>{title}</DialogHeader>
      <DialogContent>{content}</DialogContent>
      <DialogFooter>
        <Button onClick={() => onClose()}>Close</Button>
      </DialogFooter>
    </DialogBase>
  );
};
