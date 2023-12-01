import { useLocation } from 'wouter';
import { format, parseISO } from 'date-fns';
import { useGetDebtCentersQuery } from '../../api/debt-centers';
import { Button, SecondaryButton } from '@bbat/ui/button';
import { Table } from '@bbat/ui/table';
import { cents, formatEuro } from '@bbat/common/src/currency';

export const DebtCentersListing = () => {
  const { data } = useGetDebtCentersQuery();

  const [, setLocation] = useLocation();

  const rows = (data ?? []).map(center => ({ key: center.id, ...center }));

  return (
    <>
      <h1 className="text-2xl mb-5 mt-10">Debt Centers</h1>
      <p className="text-gray-800 mb-5 text-md">
        Debt centers are organizational groupings of debts, usually
        corresponding to events or other batches of sales. Here you can view and
        create new debt centers. <br />
      </p>
      <div className="flex gap-3 mb-7">
        <Button onClick={() => setLocation('/admin/debt-centers/create')}>
          Create
        </Button>
        <SecondaryButton
          onClick={() => setLocation('/admin/debt-centers/create-from-event')}
        >
          Create from event
        </SecondaryButton>
        <SecondaryButton
          onClick={() => setLocation('/admin/debts/create-debts-csv')}
        >
          Mass Import
        </SecondaryButton>
      </div>
      <Table
        rows={rows}
        onRowClick={item => setLocation(`/admin/debt-centers/${item.id}`)}
        columns={[
          { name: 'Identifier', getValue: 'humanId' },
          { name: 'Title', getValue: 'name' },
          {
            name: 'Created',
            getValue: 'createdAt',
            render: value => format(parseISO(value), 'dd.MM.yyyy'),
          },
          {
            name: 'Paid percentage',
            getValue: row =>
              !row.debtCount ? 0 : (row.paidCount ?? 0) / row.debtCount,
            render: value => (
              <div className="w-full">
                <div className="text-xs">{(value * 100).toFixed(0)}%</div>
                <div className="h-1.5 bg-gray-200 w-full rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-400"
                    style={{ width: `${(value * 100).toFixed()}%` }}
                  />
                </div>
              </div>
            ),
          },
          { name: 'Paid', getValue: 'paidCount', align: 'right' },
          { name: 'Debts Count', getValue: 'debtCount', align: 'right' },
          {
            name: 'Total value',
            getValue: row => row.total?.value ?? 0,
            align: 'right',
            render: value => formatEuro(cents(value)),
          },
        ]}
      />
    </>
  );
};
