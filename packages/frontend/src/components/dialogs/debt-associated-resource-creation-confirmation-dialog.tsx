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
              <div className="rounded-md shadow-sm border p-1.5 text-sm items-center inline-flex pr-3 mb-2">
                <span className="py-0.5 px-1.5 rounded-[2pt] bg-blue-500 text-xs font-bold text-white mr-3 capitalize">
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
