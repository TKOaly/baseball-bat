import { TableView } from '../../components/table-view'
import { useGetPayersQuery } from '../../api/payers'
import { useLocation } from 'wouter'

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
            getValue: (p) => p.tkoalyUserId ? 'Member' : 'Non-member',
          },
        ]}
      />
    </div>
  )
}
