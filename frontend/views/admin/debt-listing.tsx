import { ListView } from '../../components/list-view'
import { Button } from '../../components/button'
import { useGetDebtsQuery } from '../../api/debt'
import { useLocation } from 'wouter'

export const DebtListing = () => {
  const { data: debts } = useGetDebtsQuery(null)
  const [, setLocation] = useLocation()

  return (
    <>
      <h1 className="text-2xl mb-5 mt-10">Debts</h1>
      <p className="text-gray-800 mb-7 text-md">
        Here is listed all individual debts in the system.
        A debt corresponds usually to a single event registration, but may not have one-to-one mapping to a payment.
      </p>
      <ListView
        actions={
          <Button onClick={() => setLocation(`/admin/debts/create`)}>Create</Button>
        }
        items={(debts ?? []).map((debt) => ({
          key: debt.id,
          title: debt.name,
          description: '',
          label: debt.payer.name,
          badges: [],
        }))}
        onSelected={(item) => setLocation(`/admin/debts/${item.key}`)}
      />
    </>
  );
};
