import { Table } from '@bbat/ui/table';
import { useGetPaymentsQuery } from '../../api/payments';
import { useLocation } from 'wouter';

export const PaymentsListing = () => {
  const { data: payments } = useGetPaymentsQuery();
  const [, setLocation] = useLocation();

  return (
    <>
      <h1 className="text-2xl mt-10 mb-5">Payments</h1>

      <Table
        selectable
        rows={(payments ?? []).map(p => ({ ...p, key: p.id })) ?? []}
        onRowClick={row => setLocation(`/admin/payments/${row.id}`)}
        columns={[
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
            getValue: row => row.type,
            name: 'Type',
          },
          {
            getValue: row => row.title,
            name: 'Name',
          },
          {
            getValue: row => row.payer?.name,
            name: 'Payer',
          },
          {
            getValue: row => row.paymentNumber,
            name: 'No.',
          },
        ]}
      />
    </>
  );
};
