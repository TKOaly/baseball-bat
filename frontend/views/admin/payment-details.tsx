import { Breadcrumbs } from '../../components/breadcrumbs'
import { useCreditPaymentMutation, useGetPaymentQuery } from '../../api/payments'
import { ExternalLink } from 'react-feather'
import { DebtList } from '../../components/debt-list'
import { TableView } from '../../components/table-view'
import { SecondaryButton } from '../../components/button'
import { Link, useLocation } from 'wouter'
import { euro, formatEuro, sumEuroValues } from '../../../common/currency'
import { useGetDebtsByPaymentQuery } from '../../api/debt'

export const PaymentDetails = ({ params }) => {
  const { data: payment, isLoading } = useGetPaymentQuery(params.id)
  const { data: debts } = useGetDebtsByPaymentQuery(params.id)
  const [creditPayment] = useCreditPaymentMutation()
  const [, setLocation] = useLocation()

  if (isLoading || !payment) {
    return <div>Loading...</div>
  }

  let statusBadge = {
    text: 'Unpaid',
    color: 'bg-gray-300',
  }

  if (payment.credited) {
    statusBadge = {
      text: 'Credited',
      color: 'bg-blue-500',
    }
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
      <div className="flex gap-2">
        {!payment.credited && (
          <SecondaryButton onClick={() => creditPayment(params.id)}>Credit</SecondaryButton>
        )}
      </div>
      <div className="grid grid-cols-2 gap-x-8">
        <div className="my-4">
          <div className="text-gray-500 text-xs font-bold uppercase">Name</div>
          <div className="mt-1">{payment.title}</div>
        </div>
        <div className="my-4">
          <div className="text-gray-500 text-xs font-bold uppercase">Number</div>
          <div className="mt-1">{payment.payment_number}</div>
        </div>
        <div className="my-4">
          <div className="text-gray-500 text-xs font-bold uppercase">Total</div>
          <div className="mt-1">TODO</div>
        </div>
        <div className="my-4">
          <div className="text-gray-500 text-xs font-bold uppercase">Status</div>
          <div className="mt-1">
            <div className={`py-1 px-2.5 text-sm inline-block rounded-full ${statusBadge.color}`}>{statusBadge.text}</div>
          </div>
        </div>
        <div className="my-4 col-span-full">
          <div className="text-gray-500 text-xs font-bold uppercase">Description</div>
          <div className="rounded-md bg-gray-50 h-10 mt-2 py-2 px-3 min-h-[40px]">{payment.message}</div>
        </div>
        <div className="col-span-full">
          <div className="text-gray-500 text-xs font-bold uppercase">Debts</div>
          <DebtList debts={debts ?? []} />
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
