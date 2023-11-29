import { useLocation } from 'wouter';
import { formatEuro } from '@bbat/common/src/currency';
import { Payment } from '@bbat/common/src/types';
import { Table } from '@bbat/ui/table';

export type Props = {
  payments: Payment[];
};

export const PaymentList = ({ payments }: Props) => {
  const [, setLocation] = useLocation();
  return (
    <Table
      selectable
      rows={payments.map(p => ({ ...p, key: p.id }))}
      onRowClick={row => setLocation(`/admin/payments/${row.id}`)}
      columns={[
        { name: 'Name', getValue: 'title' },
        { name: 'Number', getValue: 'payment_number' },
        {
          name: 'Status',
          getValue: row => {
            if (row.credited) {
              return 'Credited';
            }

            return 'Unpaid';
          },
        },
        {
          name: 'Total',
          getValue: row => {
            return formatEuro(row.balance);
          },
        },
      ]}
    />
  );
};
