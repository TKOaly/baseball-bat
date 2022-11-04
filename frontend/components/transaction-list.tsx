import { BankTransaction } from '../../common/types';
import { formatEuro, cents } from '../../common/currency';
import { parseISO, format } from 'date-fns';
import { TableView } from './table-view';
import { ExternalLink } from 'react-feather';
import { useLocation } from 'wouter';
import { useDialog } from './dialog';
import { TransactionRegistrationDialog } from './dialogs/transaction-registration-dialog';

export type Props = {
  transactions: BankTransaction[]
}

export const TransactionList = ({ transactions }: Props) => {
  const [, setLocation] = useLocation();
  const showTransactionRegistrationDialog = useDialog(TransactionRegistrationDialog);

  return (
    <TableView
      rows={transactions.map(tx => ({ ...tx, key: tx.id }))}
      actions={[
        {
          key: 'register',
          text: 'Register',
          onSelect: async (transactions) => {
            await showTransactionRegistrationDialog({
              transactions,
            });
          },
        },
      ]}
      columns={[
        {
          name: 'Type',
          getValue: (tx) => tx.type,
          render: (value) => (
            {
              'credit': <span className="py-0.5 px-1.5 rounded-[2pt] bg-blue-500 text-xs font-bold text-white">Credit</span>,
              'debit': <span className="py-0.5 px-1.5 rounded-[2pt] bg-gray-300 text-xs font-bold text-gray-700">Debit</span>,
            }[value]
          ),
        },
        {
          name: 'Date',
          getValue: (tx) => parseISO(tx.date),
          render: (date) => format(date, 'dd.MM.yyyy'),
        },
        {
          name: 'Amount',
          getValue: (tx) => tx.amount.value,
          render: (value) => formatEuro(cents(value)),
          align: 'right',
        },
        {
          name: 'Other Party',
          getValue: (tx) => tx.otherParty.name,
        },
        {
          name: 'Reference',
          getValue: (tx) => tx.reference,
        },
        {
          name: 'Message',
          getValue: (tx) => tx.message,
        },
        {
          name: 'Payment',
          getValue: (row) => row.payment?.payment_number,
          render: (_, row) => {
            if (!row.payment)
              return null;

            return (
              <div
                className="flex items-center cursor-pointer gap-1"
                onClick={() => setLocation(`/admin/payments/${row.payment.id}`)}
              >
                {row.payment.payment_number}
                <ExternalLink className="h-4 text-blue-500 relative" />
              </div>
            );
          },
        },
      ]}
    />
  );
};
