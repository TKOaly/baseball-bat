import { Breadcrumbs } from '../../components/breadcrumbs'
import { useGetPayerDebtsQuery, useGetPayerEmailsQuery, useGetPayerQuery } from '../../api/payers'
import { TableView } from '../../components/table-view'
import { Link, useLocation } from 'wouter'
import { ExternalLink } from 'react-feather'

export const PayerDetails = ({ params }) => {
  const { data: payer } = useGetPayerQuery(params.id)
  const { data: emails } = useGetPayerEmailsQuery(params.id)
  const { data: debts } = useGetPayerDebtsQuery(params.id)
  const [, setLocation] = useLocation()

  if (!payer || !emails)
    return 'Loading...'

  return <>
    <h1 className="text-2xl mt-10 mb-5">
      <Breadcrumbs
        segments={[
          { url: '/admin/payers', text: 'Payers' },
          payer?.name ?? '',
        ]}
      />
    </h1>
    <div className="grid grid-cols-2 gap-x-8">
      <div className="my-4">
        <div className="text-gray-500 text-xs font-bold uppercase">Name</div>
        <div className="mt-1">{payer?.name}</div>
      </div>
      <div className="my-4">
        <div className="text-gray-500 text-xs font-bold uppercase">Emails</div>
        <div className="mt-1">
          {emails.map((email) => (
            <span title={`Source: ${email.source}`} className={`rounded-[3pt] text-sm py-0.5 px-2 ${{ primary: 'bg-blue-500 text-white', default: 'bg-gray-500 text-black', disabled: 'bg-gray-200 text-gray-500' }[email.priority]}`}>{email.email}</span>
          ))}
        </div>
      </div>
      <div className="col-span-full border-b mt-8 pb-2 uppercase text-xs font-bold text-gray-400 px-1">
        Debts
      </div>
      <div className="my-4 col-span-full">
        <TableView
          onRowClick={(row) => setLocation(`/admin/debts/${row.id}`)}
          selectable
          rows={(debts ?? []).map(d => ({ ...d, key: d.id })) ?? []}
          columns={[
            { name: 'Name', getValue: 'name' },
            {
              name: 'Collection',
              getValue: (row) => row.debtCenter.name,
              render: (_value, row) => (
                <Link onClick={(e) => e.stopPropagation()} to={`/admin/debt-centers/${row.debtCenter.id}`} className="flex gap-1 items-center">{row.debtCenter.name} <ExternalLink className="text-blue-500 h-4" /></Link>
              ),
            },
            {
              name: 'Status',
              getValue: (row) => row.draft ? 'Draft' : 'Unpaid',
              render: (value) => {
                return {
                  'Draft': <span className="py-0.5 px-1.5 rounded-[2pt] bg-blue-500 text-xs font-bold text-white">Draft</span>,
                  'Unpaid': <span className="py-0.5 px-1.5 rounded-[2pt] bg-gray-300 text-xs font-bold text-gray-600">Unpaid</span>,
                  'Paid': <span className="py-0.5 px-1.5 rounded-[2pt] bg-green-500 text-xs font-bold text-white">Paid</span>,
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
          actions={[]}
        />
      </div>
    </div>
  </>
}
