import { TableView } from '../../components/table-view'
import { useGetPayersQuery } from '../../api/payers'
import { useLocation } from 'wouter'
import { cents, formatEuro } from '../../../common/currency'

export const PayerListing = () => {
  const [, setLocation] = useLocation()
  const { data: payers } = useGetPayersQuery()

  const rows = (payers ?? [])
    .map((payer) => ({ ...payer, key: payer.id.value }))

  return (
    <div>
      <h1 className="text-2xl mt-10 md-5">Payers</h1>

      <TableView
        selectable
        rows={rows}
        onRowClick={({ id }) => setLocation(`/admin/payers/${id.value}`)}
        columns={[
          {
            name: 'Name',
            getValue: 'name',
          },
          {
            name: 'Email',
            getValue: (p) => p.emails.find(e => e.priority === 'primary').email,
          },
          {
            name: 'Membership',
            getValue: (p) => p.tkoalyUserId?.value ? 'Member' : 'Non-member',
            render: (_, p) => p.tkoalyUserId?.value
              ? <span className="py-0.5 px-1.5 rounded-[2pt] bg-blue-500 text-xs font-bold text-white">Member</span>
              : <span className="py-0.5 px-1.5 rounded-[2pt] bg-gray-300 text-xs font-bold text-gray-700">Non-member</span>,
          },
          {
            name: 'Paid percentage',
            getValue: (row) => row.debtCount ? row.paidCount / row.debtCount : 1,
            render: (value) => (
              <div className="w-full">
                <div className="text-xs">{(value * 100).toFixed(0)}%</div>
                <div className="h-1.5 bg-gray-200 w-full rounded-full overflow-hidden">
                  <div className="h-full bg-green-400" style={{ width: `${(value * 100).toFixed()}%` }} />
                </div>
              </div>
            ),
          },
          { name: 'Paid', getValue: 'paidCount', align: 'right' },
          { name: 'Debts Count', getValue: 'debtCount', align: 'right' },
          { name: 'Total value', getValue: (row) => row.total.value, align: 'right', render: (value) => formatEuro(cents(value)) },
        ]}
      />
    </div>
  )
}
