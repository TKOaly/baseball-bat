import { useReducer } from 'react'
import { CheckCircle, Circle, Info } from 'react-feather'
import { useLocation } from 'wouter'
import { euro, EuroValue, Session } from '../../common/types'
import { LargeContainer } from '../components/containers'
import { EventList } from '../components/event-list'
import { Loading } from '../components/loading'
import { PaymentTab } from '../components/payment-tab'
import { useEvents } from '../hooks'
import { PaymentPool, paymentPoolReducer } from '../state/payment-pool'
import { useGetPayerDebtsQuery, useGetPayerQuery } from '../api/payers'
import { formatEuro, sumEuroValues } from '../../common/currency'
import { format, isPast } from 'date-fns'

const FilledDisc = ({ color = 'currentColor', size = 24, ...rest }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...rest}
  >
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="3" fill="currentColor" />
  </svg>
)

type Props = {
  session: Session
}

export const Main = (props: Props) => {
  const [, setLocation] = useLocation()
  const { data: payments } = useGetPayerDebtsQuery({ id: 'me' })
  const { data: profile } = useGetPayerQuery('me')

  const unpaidPayments = (payments ?? []).filter(p => p.status === 'unpaid');
  const paidPayments = (payments ?? []).filter(p => p.status === 'paid');

  const totalEuros = unpaidPayments
    .flatMap(debt => debt.debtComponents.map(dc => dc.amount))
    .reduce(sumEuroValues, euro(0));

  return (
    <>
      <h3 className="text-xl text-gray-500 font-bold">Hei, {profile?.name}! 👋</h3>
      <p className="mt-3">
        Sinulla on yhteensä <span className="font-bold">{unpaidPayments.length}</span> maksamatonta maksua, joiden kokonaissumma on <span className="font-bold">{formatEuro(totalEuros)}</span>.
      </p>

      <h3 className="border-b-2 text-xl font-bold pb-1 mt-5 text-gray-600">
        Maksamattomat maksut
      </h3>

      {unpaidPayments.map((p) => (
        <div className="rounded-md border group border-gray-300 hover:border-blue-400 mt-5 p-4 shadow-sm cursor-pointer" onClick={() => setLocation(`/payment/${p.id}/details`)}>
          <div className="flex items-center">
            <Circle className="text-gray-500 group-hover:text-blue-500 mr-3" style={{ width: '1em', strokeWidth: '2.5px' }} />
            <div>
              <h4 className="mb-0">{p?.name}</h4>
              <div className="text-gray-400 mr-2 text-sm -mt-1">Luotu {format(new Date(p.createdAt), 'dd.MM.yyyy')}, erääntyy {format(new Date(p?.dueDate), 'dd.MM.yyyy')}</div>
            </div>
            <div className="flex-grow" />
            {
              p.dueDate && isPast(new Date(p.dueDate)) && (
                <div className="py-0.5 px-1 text-xs rounded-sm bg-red-500 mx-2 font-bold text-white">Myöhässä</div>
              )
            }
            <span className="font-bold text-gray-600">{formatEuro(p.debtComponents.map(c => c.amount).reduce(sumEuroValues))}</span>
          </div>
        </div>
      ))}

      {unpaidPayments.length === 0 && (
        <div className="py-3 flex items-center text-gray-600 gap-3 px-3 bg-gray-100 border shadow border-gray-300 rounded-md mt-3">
          <Info />
          Ei maksamattomia maksuja
        </div>
      )}

      <h3 className="border-b-2 text-xl font-bold pb-1 mt-5 text-gray-600">
        Maksetut maksut
      </h3>

      {paidPayments.map((p) => (
        <div className="rounded-md border border-blue-400 mt-5 p-4 shadow-sm">
          <div className="flex items-center">
            <CheckCircle className="text-blue-500 mr-3" style={{ width: '1em', strokeWidth: '2.5px' }} />
            <h4>{p?.name}</h4>
            <div className="flex-grow" />
            <span className="font-bold text-gray-600">{formatEuro(p.debtComponents.map(c => c.amount).reduce(sumEuroValues))}</span>
          </div>
        </div>
      ))}

      {paidPayments.length === 0 && (
        <div className="py-3 flex items-center text-gray-600 gap-3 px-3 bg-gray-50 border shadow border-gray-300 rounded-md mt-3">
          <Info />
          Ei maksettuja maksuja
        </div>
      )}
    </>
  )
}
