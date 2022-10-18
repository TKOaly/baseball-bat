import { TableView } from './table-view'
import { Debt, DebtWithPayer, PayerProfile } from '../../common/types'
import { Link, useLocation } from 'wouter';
import { useDeleteDebtMutation, usePublishDebtsMutation } from '../api/debt';
import { ExternalLink } from 'react-feather';

export type Props = {
  debts: (DebtWithPayer | Debt)[]
  payer?: PayerProfile
}

export const DebtList = (props: Props) => {
  const [publishDebts] = usePublishDebtsMutation()
  const [deleteDebt] = useDeleteDebtMutation()
  const [, setLocation] = useLocation()

  const rows: (DebtWithPayer & { key: string })[] = (props.debts ?? [])
    .map((d) => props.payer ? ({ ...d, payer: props.payer, key: d.id }) : ({ ...d, key: d.id })) as any

  return (
    <TableView
      onRowClick={(row) => setLocation(`/admin/debts/${row.id}`)}
      selectable
      rows={rows}
      columns={[
        { name: 'Name', getValue: 'name' },
        {
          name: 'Payer',
          getValue: (row) => row.payer.name,
          render: (_value, row) => (
            <Link onClick={(e) => e.stopPropagation()} to={`/admin/payers/${row.payer.id.value}`} className="flex gap-1 items-center">{row.payer.name} <ExternalLink className="text-blue-500 h-4" /></Link>
          ),
        },
        {
          name: 'Status',
          getValue: (row) => {
            if (row.credited) {
              return 'Credited';
            }

            if (row.draft) {
              return 'Draft'
            }

            if (row.status === 'paid') {
              return 'Paid'
            }

            return 'Unpaid'
          },
          render: (value) => {
            return {
              'Draft': <span className="py-0.5 px-1.5 rounded-[2pt] bg-gray-500 text-xs font-bold text-white">Draft</span>,
              'Unpaid': <span className="py-0.5 px-1.5 rounded-[2pt] bg-gray-300 text-xs font-bold text-gray-600">Unpaid</span>,
              'Paid': <span className="py-0.5 px-1.5 rounded-[2pt] bg-green-500 text-xs font-bold text-white">Paid</span>,
              'Credited': <span className="py-0.5 px-1.5 rounded-[2pt] bg-blue-500 text-xs font-bold text-white">Credited</span>,
            }[value]
          },
        },
        {
          name: 'Labels',
          getValue: () => null,
          render: () => (
            <>
              {Math.random() > 0.5 && <span className="py-0.5 px-1.5 rounded-[2pt] bg-gray-300 text-xs font-bold text-gray-600 mr-2">External</span>}
              {Math.random() > 0.5 && <span className="py-0.5 px-1.5 rounded-[2pt] bg-gray-300 text-xs font-bold text-gray-600">Manual</span>}
            </>
          ),
        }
      ]}
      actions={[
        {
          key: 'delete',
          text: 'Delete',
          disabled: (row) => !row.draft,
          onSelect: async (rows) => {
            await Promise.all(rows.map(({ id }) => deleteDebt(id)))
          },
        },
        {
          key: 'publish',
          text: 'Publish',
          onSelect: async (rows) => {
            await publishDebts(rows.map(r => r.id))
          },
        }
      ]}
    />
  );
}
