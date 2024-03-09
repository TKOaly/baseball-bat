import { Button, SecondaryButton } from '@bbat/ui/button';
import {
  DialogBase,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from '../dialog';

export type Props = {
  onClose: (confirmed: boolean) => void;
  remove: string[];
  create: string[];
  change: string[];
};

const DebtComponentList = ({ components }: { components: string[] }) => (
  <ul className="mt-3">
    {components.map(name => (
      <li key={name}>
        <div className="mb-2 inline-flex items-center rounded-md border p-1.5 pr-3 text-sm shadow-sm">
          <span className="mr-3 rounded-[2pt] bg-blue-500 px-1.5 py-0.5 text-xs font-bold capitalize text-white">
            Debt Component
          </span>
          <span>{name}</span>
        </div>
      </li>
    ))}
  </ul>
);

export const DebtCenterConfirmationDialog = ({
  onClose,
  remove,
  create,
  change,
}: Props) => {
  return (
    <DialogBase onClose={() => onClose(false)}>
      <DialogHeader>Creating additional resources</DialogHeader>
      <DialogContent>
        {remove.length > 0 && (
          <>
            <p>The following debt components are about to be deleted:</p>
            <DebtComponentList components={remove} />
          </>
        )}

        {create.length > 0 && (
          <>
            <p>The following debt components are about to be created:</p>
            <DebtComponentList components={create} />
          </>
        )}

        {change.length > 0 && (
          <>
            <p>The following debt components are about to be modified:</p>
            <DebtComponentList components={change} />
          </>
        )}
      </DialogContent>
      <DialogFooter>
        <SecondaryButton onClick={() => onClose(false)}>Cancel</SecondaryButton>
        <Button onClick={() => onClose(true)}>Continue</Button>
      </DialogFooter>
    </DialogBase>
  );
};
