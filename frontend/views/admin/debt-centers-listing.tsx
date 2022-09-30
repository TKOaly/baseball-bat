import { ListView } from '../../components/list-view'
import { tw } from '../../tailwind'
import { useLocation } from 'wouter';
import { format, parseISO } from 'date-fns'
import { useGetDebtCentersQuery } from '../../api/debt-centers'
import { Button, SecondaryButton } from '../../components/button'
import { TableView } from '../../components/table-view';

export const DebtCentersListing = () => {
  const { data, isLoading } = useGetDebtCentersQuery(null)

  const [, setLocation] = useLocation();

  const debtCenters = data && !isLoading ? data : [];

  const rows = (data ?? []).map((center) => ({ key: center.id, ...center }))

  return (
    <>
      <h1 className="text-2xl mb-5 mt-10">Debt Centers</h1>
      <p className="text-gray-800 mb-7 text-md">
        Debt centers are organizational groupings of debts, usually corresponding to events or other batches of sales.
        Here you can view and create new debt centers. <br />
      </p>
      <TableView
        rows={rows}
        onRowClick={(item) => setLocation(`/admin/debt-centers/${item.id}`)}
        columns={[
          { name: 'Title', getValue: 'name' },
          {
            name: 'Created',
            getValue: 'createdAt',
            render: (value) => format(parseISO(value), 'dd.MM.yyyy'),
          },
          {
            name: 'Paid percentage',
            getValue: (row) => row.paidCount / row.debtCount,
            render: (value) => (
              <div className="w-full">
                <div className="text-xs">{(value * 100).toFixed(0)}%</div>
                <div className="h-1.5 bg-gray-200 w-full rounded-full overflow-hidden">
                  <div className="h-full bg-green-400" style={{ width: `${(value * 100).toFixed()}%` }} />
                </div>
              </div>
            ),
          },
          { name: 'Paid', getValue: 'paidCount', align: 'right' },
          { name: 'Debts Count', getValue: 'debtCount', align: 'right' },
        ]}
      />
    </>
  );
};
