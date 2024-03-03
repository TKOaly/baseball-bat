import { Table } from '@bbat/ui/table';
import { useGetPaymentsQuery } from '../../api/payments';
import { useLocation } from 'wouter';
import { useHistoryPersister } from '../../hooks/use-history-persister';
import { formatEuro } from '@bbat/common/src/currency';

export const PaymentsListing = () => {
  const { data: payments } = useGetPaymentsQuery();
  const [, setLocation] = useLocation();
  const historyPersiter = useHistoryPersister();

  return (
    <>
      <h1 className="text-2xl mt-10 mb-5">Payments</h1>

      <Table
        selectable
        persist={historyPersiter('payments')}
        rows={(payments ?? []).map(p => ({ ...p, key: p.id })) ?? []}
        onRowClick={row => setLocation(`/admin/payments/${row.id}`)}
        columns={[
          {
            getValue: row => row.paymentNumber,
            name: 'No.',
          },
          {
            getValue: row => row.type,
            name: 'Type',
          },
          {
            getValue: row => row.title,
            name: 'Name',
          },
          {
            getValue: row => {
              if (row.credited) {
                return 'Credited';
              }

              return row.status;
            },
            name: 'Status',
          },
          {
            name: 'Balance',
            align: 'right',
            getValue: row => row.balance,
            render: formatEuro,
          },
        ]}
      />
    </>
  );
};
