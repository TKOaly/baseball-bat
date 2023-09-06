import {
  DialogBase,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from '../../components/dialog';
import { Button } from '../../components/button';

export const InfoDialog = ({ onClose, title, content }) => {
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
