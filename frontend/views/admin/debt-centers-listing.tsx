import { ListView } from '../../components/list-view'
import { tw } from '../../tailwind'
import { useLocation } from 'wouter';
import { useGetDebtCentersQuery } from '../../api/debt-centers'
import { Button, SecondaryButton } from '../../components/button'

export const DebtCentersListing = () => {
  const { data, isLoading } = useGetDebtCentersQuery(null)

  const [, setLocation] = useLocation();

  const debtCenters = data && !isLoading ? data : [];

  return (
    <>
      <h1 className="text-2xl mb-5 mt-10">Debt Centers</h1>
      <p className="text-gray-800 mb-7 text-md">
        Debt centers are organizational groupings of debts, usually corresponding to events or other batches of sales.
        Here you can view and create new debt centers.
      </p>
      <ListView
        actions={
          <>
            <Button onClick={() => setLocation('/admin/debt-centers/create')}>Create</Button>
            <SecondaryButton onClick={() => setLocation('/admin/debt-centers/create-from-event')}>Create from Event</SecondaryButton>
          </>
        }
        items={debtCenters.map((center) => ({
          key: center.id,
          title: center.name,
          description: center.description,
          label: center.url,
          badges: [],
        }))}
        onSelected={(item) => setLocation(`/admin/debt-centers/${item.key}`)}
      />
    </>
  );
};
