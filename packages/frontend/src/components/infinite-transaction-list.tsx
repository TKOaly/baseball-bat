import { BankTransaction } from '@bbat/common/src/types';
import { formatEuro, cents } from '@bbat/common/src/currency';
import { format } from 'date-fns';
import { ExternalLink } from 'react-feather';
import { useLocation } from 'wouter';
import { useDialog } from './dialog';
import { TransactionRegistrationDialog } from './dialogs/transaction-registration-dialog';
import {
  InfiniteTable,
  PaginatedBaseQuery,
  PaginatedQueryDefinition,
} from './infinite-table';
import { QueryHooks } from '@reduxjs/toolkit/dist/query/react/buildHooks';

export type Props<Q extends PaginatedBaseQuery> = {
  endpoint: QueryHooks<PaginatedQueryDefinition<BankTransaction, Q>>;
  query?: Omit<Q, 'cursor' | 'sort' | 'limit'>;
};

export const TransactionList = <Q extends PaginatedBaseQuery>({
  endpoint,
  query,
}: Props<Q>) => {
  const [, setLocation] = useLocation();
  const showTransactionRegistrationDialog = useDialog(
    TransactionRegistrationDialog,
  );

  return (
    <InfiniteTable
      endpoint={endpoint}
      query={query}
      actions={[
        {
          key: 'register',
          text: 'Register',
          onSelect: async ([transaction]) => {
            await showTransactionRegistrationDialog({
              transaction,
            });
          },
        },
      ]}
      columns={[
        {
          name: 'Type',
          key: 'type',
          getValue: tx => tx.type,
          render: value => {
            if (value === 'credit') {
              return (
                <span className="py-0.5 px-1.5 rounded-[2pt] bg-blue-500 text-xs font-bold text-white">
                  Credit
                </span>
              );
            } else if (value === 'debit') {
              return (
                <span className="py-0.5 px-1.5 rounded-[2pt] bg-gray-300 text-xs font-bold text-gray-700">
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
                  className="flex items-center cursor-pointer gap-1"
                  onClick={() => setLocation(`/admin/payments/${payment.id}`)}
                >
                  {payment.paymentNumber}
                  <ExternalLink className="h-4 text-blue-500 relative" />
                </div>
              );
            }

            return <span>{row.payments.length} payments</span>;
          },
        },
      ]}
    />
  );
};
