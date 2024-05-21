import { useLocation } from 'wouter';
import { formatEuro } from '@bbat/common/src/currency';
import { Payment } from '@bbat/common/src/types';
import { cva } from 'class-variance-authority';
import { twMerge } from 'tailwind-merge';
import {
  InfiniteTable,
  Props as InfiniteTableProps,
  PaginatedBaseQuery,
} from './infinite-table';

const badgeClasses =
  'py-0.5 px-1 rounded-[2pt] text-xs font-bold bg-gray-200 text-gray-700';

const statusBadgeCva = cva(badgeClasses, {
  variants: {
    type: {
      paid: 'bg-green-500 text-white',
      unpaid: 'bg-red-500 text-white',
      mispaid: 'bg-orange-500 text-white',
      credited: 'bg-blue-500 text-white',
    },
  },
});

const typeBadgeCva = cva([badgeClasses, 'text-white'], {
  variants: {
    type: {
      invoice: 'bg-blue-600',
      cash: 'bg-green-600',
      stripe: 'bg-[#6B71E3]',
    },
  },
});

const capitalize = (s: string) => s.at(0)?.toUpperCase() + s.substring(1);

export type Props<Q extends PaginatedBaseQuery> = Omit<
  InfiniteTableProps<Payment, Q>,
  'columns' | 'actions'
>;

export const PaymentList = <Q extends PaginatedBaseQuery>(props: Props<Q>) => {
  const [, setLocation] = useLocation();
  return (
    <InfiniteTable
      {...props}
      selectable
      onRowClick={row => setLocation(`/admin/payments/${row.id}`)}
      initialSort={{
        column: 'Number',
        direction: 'asc',
      }}
      persist="payments"
      columns={[
        {
          getValue: row => row.paymentNumber,
          name: 'Number',
          key: 'payment_number',
        },
        {
          getValue: row => row.type,
          name: 'Type',
          key: 'type',
          render: type => (
            <span className={twMerge(typeBadgeCva({ type }))}>
              {capitalize(type)}
            </span>
          ),
        },
        {
          getValue: row => row.title,
          name: 'Title',
          key: 'title',
        },
        {
          getValue: row => {
            if (row.credited) {
              return 'Credited';
            }

            return row.status;
          },
          name: 'Status',
          key: 'status',
          render: type => (
            <span className={twMerge(statusBadgeCva({ type }))}>
              {capitalize(type)}
            </span>
          ),
        },
        {
          name: 'Balance',
          key: 'balance',
          align: 'right',
          getValue: row => row.balance,
          render: formatEuro,
          compareBy: amount => amount.value,
        },
      ]}
    />
  );
};
