import { Button } from '../button';
import {
  DialogBase,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from '../dialog';

type Props = {
  onClose: (useDetectedHeaders: boolean) => void;
  headers: string[];
};

export const DetectHeadersDialog = ({ onClose }: Props) => {
  return (
    <DialogBase onClose={() => onClose(false)}>
      <DialogHeader>Column headers detected</DialogHeader>
      <DialogContent>
        <p>
          Data you imported appears to have column names on it{"'"}s first row.{' '}
          <br />
          Do you want to use the first row as column headers?
        </p>
      </DialogContent>
      <DialogFooter>
        <Button secondary onClick={() => onClose(false)}>
          Interpret as data
        </Button>
        <Button onClick={() => onClose(true)}>Interpret as headers</Button>
      </DialogFooter>
    </DialogBase>
  );
};
