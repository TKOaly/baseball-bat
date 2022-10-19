import { Button, SecondaryButton } from '../../components/button'
import { DialogBase, DialogContent, DialogFooter, DialogHeader } from '../dialog'

export type Props = {
  onClose: (confirmed: boolean) => void,
  remove: string[]
  create: string[]
}

const DebtComponentList = ({ components }: { components: string[] }) => (
  <ul className="mt-3">
    {components.map((name) => (
      <li>
        <div className="rounded-md shadow-sm border p-1.5 text-sm items-center inline-flex pr-3 mb-2">
          <span className="py-0.5 px-1.5 rounded-[2pt] bg-blue-500 text-xs font-bold text-white mr-3 capitalize">Debt Component</span>
          <span>{name}</span>
        </div>
      </li>
    ))}
  </ul>
)

export const DebtCenterConfirmationDialog = ({ onClose, remove, create }: Props) => {
  console.log(remove, create)

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
      </DialogContent>
      <DialogFooter>
        <SecondaryButton onClick={() => onClose(false)}>Cancel</SecondaryButton>
        <Button onClick={() => onClose(true)}>Continue</Button>
      </DialogFooter>
    </DialogBase>
  )
}
