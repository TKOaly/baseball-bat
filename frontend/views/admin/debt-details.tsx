import { Breadcrumbs } from '../../components/breadcrumbs'
import { useCreditDebtMutation, useDeleteDebtMutation, useGetDebtQuery, usePublishDebtsMutation } from '../../api/debt'
import { ExternalLink } from 'react-feather';
import { TabularFieldList } from '../../components/tabular-field-list';
import { TextField } from '../../components/text-field';
import { Button, SecondaryButton } from '../../components/button'
import { EuroField } from '../../components/euro-field';
import { useLocation } from 'wouter';
import { euro, formatEuro, sumEuroValues } from '../../../common/currency';
import { format } from 'date-fns';

export const DebtDetails = ({ params }) => {
  const { data: debt, isLoading } = useGetDebtQuery(params.id)
  const [deleteDebt] = useDeleteDebtMutation()
  const [creditDebt] = useCreditDebtMutation()
  const [, setLocation] = useLocation()
  const [publishDebts] = usePublishDebtsMutation()

  if (isLoading) {
    return <div>Loading...</div>
  }

  const handleDelete = () => {
    deleteDebt(params.id)
  }

  const handleCredit = () => {
    creditDebt(params.id)
  }

  const handlePublish = () => {
    publishDebts([params.id])
  }

  let statusBadge = {
    text: 'Unpaid',
    color: 'bg-gray-300',
  }

  if (debt.draft) {
    statusBadge = {
      text: 'Draft',
      color: 'bg-gray-300',
    }
  }

  if (debt.credited) {
    statusBadge = {
      text: 'Credited',
      color: 'bg-blue-500 text-white',
    }
  }

  return (
    <div>
      <h1 className="text-2xl mt-10 mb-5">
        <Breadcrumbs
          segments={[
            {
              text: 'Debts',
              url: '/admin/debts'
            },
            debt?.name ?? ''
          ]}
        />
      </h1>
      <div className="flex gap-2">
        {debt?.draft === true && (
          <Button onClick={handlePublish}>Publish</Button>
        )}
        {debt?.draft && <SecondaryButton onClick={handleDelete}>Delete</SecondaryButton>}
        {debt?.draft === false && debt?.credited === false && (
          <SecondaryButton onClick={handleCredit}>Credit</SecondaryButton>
        )}
      </div>
      <div className="grid grid-cols-2 gap-x-8">
        <div className="my-4">
          <div className="text-gray-500 text-xs font-bold uppercase">Name</div>
          <div className="mt-1">{debt.name}</div>
        </div>
        <div className="my-4">
          <div className="text-gray-500 text-xs font-bold uppercase mb-1">Payer</div>
          <div className="mt-1 flex items-center cursor-pointer gap-1" onClick={() => setLocation(`/admin/payers/${debt.payer.id.value}`)}>{debt.payer.name} <ExternalLink className="h-4 text-blue-500 relative" /></div>
        </div>
        <div className="my-4">
          <div className="text-gray-500 text-xs font-bold uppercase mb-1">Collection</div>
          <div className="mt-1 flex items-center cursor-pointer gap-1" onClick={() => setLocation(`/admin/debt-centers/${debt.debtCenter.id}`)}>{debt.debtCenter.name} <ExternalLink className="h-4 text-blue-500 relative" /></div>
        </div>
        <div className="my-4">
          <div className="text-gray-500 text-xs font-bold uppercase">Total</div>
          <div className="mt-1">{formatEuro(debt.debtComponents.map(c => c.amount).reduce(sumEuroValues, euro(0)))}</div>
        </div>
        <div className="my-4">
          <div className="text-gray-500 text-xs font-bold uppercase">Due Date</div>
          <div className="mt-1">{format(new Date(debt.dueDate), 'dd.MM.yyyy')}</div>
        </div>
        <div className="my-4">
          <div className="text-gray-500 text-xs font-bold uppercase">Status</div>
          <div className="mt-1">
            <div className={`py-1 px-2.5 text-sm inline-block rounded-full ${statusBadge.color}`}>{statusBadge.text}</div>
          </div>
        </div>
        <div className="my-4 col-span-full">
          <div className="text-gray-500 text-xs font-bold uppercase">Description</div>
          <div className="rounded-md bg-gray-50 h-10 mt-2 py-2 px-3 min-h-[40px]">{debt.description}</div>
        </div>
        <div className="col-span-full">
          <div className="text-gray-500 text-xs font-bold uppercase mb-3 mt-4">Content</div>
          <TabularFieldList
            value={debt.debtComponents.map(c => ({ ...c, amount: c.amount.value / 100 }))}
            readOnly
            columns={[
              {
                key: 'name',
                header: 'Component',
                component: TextField,
                props: { readOnly: true },
              },
              {
                key: 'amount',
                header: 'Price',
                component: EuroField,
                props: { readOnly: true },
              },
            ]}
            createNew={function() {
              throw new Error('Function not implemented.');
            }}
          />
        </div>
      </div>
    </div>
  );
};
