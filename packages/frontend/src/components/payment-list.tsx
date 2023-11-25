import React from 'react';
import { useLocation } from 'wouter';
import { cents, formatEuro } from '@bbat/common/src/currency';
import { Payment } from '@bbat/common/src/types';
import { TableView } from './table-view';

export type Props = {
  payments: Payment[];
};

export const PaymentList = ({ payments }: Props) => {
  const [, setLocation] = useLocation();
  return (
    <TableView
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
            return formatEuro(cents(row.balance));
          },
        },
      ]}
    />
  );
};
