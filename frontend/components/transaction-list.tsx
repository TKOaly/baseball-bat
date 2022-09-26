import { BankTransaction } from '../../common/types'
import { formatEuro, cents } from '../../common/currency'
import { parseISO, format } from 'date-fns'
import { TableView } from './table-view'

export type Props = {
  transactions: BankTransaction[]
}

export const TransactionList = ({ transactions }: Props) => {
  return (
    <TableView
      rows={transactions.map(tx => ({ ...tx, key: tx.id }))}
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
      ]}
    />
  );
};
