import { DialogBase, DialogContent, DialogFooter, DialogHeader } from '../../components/dialog';
import { Button } from '../../components/button';
import { AlertTriangle } from 'react-feather';

export const ErrorDialog = ({ onClose, title, content }) => {
  return (
    <DialogBase onClose={() => onClose()}>
      <DialogHeader>
        <AlertTriangle className="text-red-600" />
        {title}
      </DialogHeader>
      <DialogContent>
        {content}
      </DialogContent>
      <DialogFooter>
        <Button onClick={() => onClose()}>Close</Button>
      </DialogFooter>
    </DialogBase>
  );
};
