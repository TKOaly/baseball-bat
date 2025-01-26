import { useLocation } from 'wouter';
import { parseISO } from 'date-fns/parseISO';
import { format } from 'date-fns/format';
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
      <h1 className="mb-5 mt-10 text-2xl">Debt Centers</h1>
      <p className="text-md mb-5 text-gray-800">
        Debt centers are organizational groupings of debts, usually
        corresponding to events or other batches of sales. Here you can view and
        create new debt centers. <br />
      </p>
      <div className="mb-7 flex gap-3">
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
        persist="debt-centers"
        rows={rows}
        onRowClick={item => setLocation(`/admin/debt-centers/${item.id}`)}
        columns={[
          {
            name: 'Identifier',
            key: 'id',
            getValue: 'humanId',
            filter: { search: true },
          },
          {
            name: 'Title',
            key: 'title',
            getValue: 'name',
            filter: { search: true },
          },
          {
            name: 'Created',
            key: 'created',
            getValue: 'createdAt',
            render: value => format(parseISO(value), 'dd.MM.yyyy'),
          },
          {
            name: 'Paid percentage',
            key: 'paid_percentage',
            getValue: row =>
              !row.debtCount ? 0 : (row.paidCount ?? 0) / row.debtCount,
            render: value => (
              <div className="w-full">
                <div className="text-xs">{(value * 100).toFixed(0)}%</div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
                  <div
                    className="h-full bg-green-400"
                    style={{ width: `${(value * 100).toFixed()}%` }}
                  />
                </div>
              </div>
            ),
          },
          {
            name: 'Paid',
            key: 'paid_count',
            getValue: 'paidCount',
            align: 'right',
          },
          {
            name: 'Debts Count',
            key: 'debt_count',
            getValue: 'debtCount',
            align: 'right',
          },
          {
            name: 'Total value',
            key: 'total_value',
            getValue: row => row.total?.value ?? 0,
            align: 'right',
            render: value => formatEuro(cents(value)),
          },
        ]}
      />
    </>
  );
};
