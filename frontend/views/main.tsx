import { useReducer } from 'react'
import { useLocation } from 'wouter'
import { Session } from '../../common/types'
import { LargeContainer } from '../components/containers'
import { EventList } from '../components/event-list'
import { Loading } from '../components/loading'
import { PaymentTab } from '../components/payment-tab'
import { useEvents } from '../hooks'
import { PaymentPool, paymentPoolReducer } from '../state/payment-pool'

type Props = {
  session: Session
}

export const Main = (props: Props) => {
  const events = useEvents()
  const [paymentPool, dispatch] = useReducer(paymentPoolReducer, {
    items: [],
    totalSum: 0,
  })
  const setLocation = useLocation()[1]

  if (!props.session.paymentMethod) {
    setLocation('/onboarding')
    return null
  }

  if (!events) {
    return (
      <LargeContainer>
        <Loading />
      </LargeContainer>
    )
  }

  return (
    <LargeContainer>
      <PaymentPool.Provider
        value={{
          items: paymentPool.items,
          totalSum: paymentPool.totalSum,
          dispatch,
        }}
      >
        <EventList events={events} />
        <PaymentTab session={props.session} />
      </PaymentPool.Provider>
    </LargeContainer>
  )
}
