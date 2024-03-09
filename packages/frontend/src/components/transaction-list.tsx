import { BankTransaction } from '@bbat/common/src/types';
import { formatEuro, cents } from '@bbat/common/src/currency';
import format from 'date-fns/format';
import { ExternalLink } from 'react-feather';
import { useLocation } from 'wouter';
import { useDialog } from './dialog';
import { TransactionRegistrationDialog } from './dialogs/transaction-registration-dialog';
import {
  Props as InfiniteTableProps,
  InfiniteTable,
  PaginatedBaseQuery,
} from './infinite-table';
import { ComponentProps } from 'react';
import { Table } from '@bbat/ui/src/table';

export type Props<Q extends PaginatedBaseQuery> =
  | Omit<InfiniteTableProps<BankTransaction, Q>, 'columns' | 'actions'>
  | {
      transactions: BankTransaction[];
    };

type Common<A, B> = {
  [P in keyof A & keyof B]: A[P] | B[P];
};

export const TransactionList = <Q extends PaginatedBaseQuery>(
  props: Props<Q>,
) => {
  const [, setLocation] = useLocation();
  const showTransactionRegistrationDialog = useDialog(
    TransactionRegistrationDialog,
  );

  const commonProps: Common<
    ComponentProps<typeof Table<BankTransaction & { key: string }, any, any>>,
    ComponentProps<typeof InfiniteTable<BankTransaction & { key: string }, any>>
  > = {
    footer: undefined,
    selectable: undefined,
    onRowClick: undefined,
    emptyMessage: undefined,
    hideTools: undefined,
    initialSort: undefined,
    persist: undefined,
    columns: [
      {
        name: 'Type',
        key: 'type',
        getValue: tx => tx.type,
        render: value => {
          if (value === 'credit') {
            return (
              <span className="rounded-[2pt] bg-blue-500 px-1.5 py-0.5 text-xs font-bold text-white">
                Credit
              </span>
            );
          } else if (value === 'debit') {
            return (
              <span className="rounded-[2pt] bg-gray-300 px-1.5 py-0.5 text-xs font-bold text-gray-700">
                Debit
              </span>
            );
          } else {
            return null;
          }
        },
      },
      {
        name: 'Date',
        key: 'value_time',
        getValue: tx => tx.date,
        render: date => format(date, 'dd.MM.yyyy'),
      },
      {
        name: 'Amount',
        key: 'amount',
        getValue: tx => tx.amount.value,
        render: value => formatEuro(cents(value)),
        align: 'right',
      },
      {
        name: 'Other Party',
        key: 'other_party_name',
        getValue: tx => tx.otherParty?.name,
      },
      {
        name: 'Reference',
        key: 'reference',
        getValue: tx => tx.reference,
      },
      {
        name: 'Message',
        key: 'message',
        getValue: tx => tx.message,
      },
      {
        name: 'Payment',
        key: 'payment_count',
        getValue: row => row.payments,
        render: (_, row) => {
          if (row.payments.length === 0) return null;

          if (row.payments.length === 1) {
            const [payment] = row.payments;

            return (
              <div
                className="flex cursor-pointer items-center gap-1"
                onClick={() => setLocation(`/admin/payments/${payment.id}`)}
              >
                {payment.paymentNumber}
                <ExternalLink className="relative h-4 text-blue-500" />
              </div>
            );
          }

          return <span>{row.payments.length} payments</span>;
        },
      },
    ],
    actions: [
      {
        key: 'register',
        text: 'Register',
        onSelect: async ([transaction]) => {
          await showTransactionRegistrationDialog({
            transaction,
          });
        },
      },
    ],
  };

  if ('endpoint' in props) {
    return <InfiniteTable {...commonProps} {...props} />;
  } else {
    return (
      <Table
        {...commonProps}
        rows={props.transactions.map(tx => ({ key: tx.id, ...tx }))}
      />
    );
  }
};
