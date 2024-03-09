import {
  DialogBase,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from '../../components/dialog';
import { Button, SecondaryButton } from '@bbat/ui/button';

export type Props = {
  onClose: (confirmed: boolean) => void;
  components: string[];
  debtCenter: string | null;
};

export const DebtAssociatedResourceCreationConfirmationDialog = ({
  onClose,
  components,
  debtCenter,
}: Props) => {
  const resources = [];

  if (debtCenter) {
    resources.push({
      type: 'Debt Center',
      name: debtCenter,
    });
  }

  resources.push(...components.map(name => ({ type: 'Debt Component', name })));

  return (
    <DialogBase
      onClose={() => onClose(false)}
      data-cy="edit-resource-creation-confirmation-dialog"
    >
      <DialogHeader>Creating additional resources</DialogHeader>
      <DialogContent>
        The following new resources are about to be created:
        <ul className="mt-3">
          {resources.map(({ type, name }) => (
            <li key={`${type}-${name}`}>
              <div className="mb-2 inline-flex items-center rounded-md border p-1.5 pr-3 text-sm shadow-sm">
                <span className="mr-3 rounded-[2pt] bg-blue-500 px-1.5 py-0.5 text-xs font-bold capitalize text-white">
                  {type}
                </span>
                <span>{name}</span>
              </div>
            </li>
          ))}
        </ul>
      </DialogContent>
      <DialogFooter>
        <SecondaryButton onClick={() => onClose(false)}>Cancel</SecondaryButton>
        <Button onClick={() => onClose(true)}>Continue</Button>
      </DialogFooter>
    </DialogBase>
  );
};
