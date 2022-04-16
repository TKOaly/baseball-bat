import { Breadcrumbs } from '../../components/breadcrumbs'
import { useGetPaymentQuery } from '../../api/payments'
import { ExternalLink } from 'react-feather'
import { TableView } from '../../components/table-view'
import { Link, useLocation } from 'wouter'
import { euro, formatEuro, sumEuroValues } from '../../../common/currency'

export const PaymentDetails = ({ params }) => {
  const { data, isLoading } = useGetPaymentQuery(params.id)
  const [, setLocation] = useLocation()
  const payment = data?.payment
  const debts = data?.debts

  if (isLoading || !payment) {
    return <div>Loading...</div>
  }

  return (
    <div>
      <h1 className="text-2xl mt-10 mb-5">
        <Breadcrumbs
          segments={[
            {
              text: 'Payments',
              url: '/admin/payments'
            },
            payment.payment_number ? '' + payment.payment_number : '',
          ]}
        />
      </h1>
      <div className="grid grid-cols-2 gap-x-8">
        <div className="my-4">
          <div className="text-gray-500 text-xs font-bold uppercase">Name</div>
          <div className="mt-1">{payment.message}</div>
        </div>
        <div className="my-4">
          <div className="text-gray-500 text-xs font-bold uppercase">Number</div>
          <div className="mt-1">{payment.payment_number}</div>
        </div>
        <div className="my-4">
          <div className="text-gray-500 text-xs font-bold uppercase">Total</div>
          <div className="mt-1">TODO</div>
        </div>
        <div className="my-4 col-span-full">
          <div className="text-gray-500 text-xs font-bold uppercase">Description</div>
          <div className="rounded-md bg-gray-50 h-10 mt-2 py-2 px-3 min-h-[40px]">{payment.message}</div>
        </div>
        <div className="col-span-full">
          <div className="text-gray-500 text-xs font-bold uppercase">Debts</div>
          <TableView
            rows={debts ?? []}
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
                getValue: () => null,
                render: () => {
                  const r = Math.random();
                  return [
                    <span className="py-0.5 px-1.5 rounded-[2pt] bg-blue-500 text-xs font-bold text-white">Draft</span>,
                    <span className="py-0.5 px-1.5 rounded-[2pt] bg-gray-300 text-xs font-bold text-gray-600">Unpaid</span>,
                    <span className="py-0.5 px-1.5 rounded-[2pt] bg-green-500 text-xs font-bold text-white">Paid</span>,
                  ][Math.floor(r * 3)]
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
              },
              {
                name: 'Amount',
                align: 'right',
                getValue: (row) => row.debtComponents.map(c => c.amount).reduce(sumEuroValues, euro(0)),
                render: (value) => formatEuro(value),
              }
            ]}
          />
        </div>
        <div className="col-span-full mt-14">
          <div className="text-gray-500 text-xs font-bold uppercase mb-8">Transactions</div>
          <TableView
            rows={[
              {
                date: new Date(),
                amount: euro(100),
              }
            ]}
            columns={[
              {
                name: 'Time',
                getValue: 'date',
                render: (value) => new Intl.DateTimeFormat('fi', {}).format(value),
              },
              {
                name: 'Amount',
                getValue: 'amount',
                render: formatEuro,
                align: 'right',
              },
              {
                name: 'Debitor',
                getValue: () => 'Mitja Karhusaari',
              },
              {
                name: 'Description',
                getValue: () => 'Payment with message 128304971',
              },
            ]}
          />
        </div>
      </div>
    </div>
  )
}
