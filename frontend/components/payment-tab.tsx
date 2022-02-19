import { useContext, useState } from 'react'
import styled from 'styled-components'
import { Link } from 'wouter'
import { Session } from '../../common/types'
import { payEvents } from '../api'
import { PaymentPool, PaymentPoolItem } from '../state/payment-pool'
import { Button } from './button'
import { Loading } from './loading'

const PaymentTabWrapper = styled.div`
  height: 100%;
  display: flex;
  align-items: center;
  flex-direction: column;
  width: 50%;
  margin: 10px;
`

const PaymentPoolContainer = styled.div`
  background: #ffffff;
  box-shadow: 1px 1px 10px rgba(0, 0, 0, 0.25);
  border-radius: 5px;
  width: 100%;
`
const PaymentPoolItemContainer = styled.div`
  font-family: 'Roboto Mono', monospace;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  margin: 10px;
`

const paymentPoolItem = (item: PaymentPoolItem) => (
  <PaymentPoolItemContainer>
    {item.items.map(e => (
      <p>
        {item.eventName} {e.itemName}
      </p>
    ))}
    {item.items.map(e => (
      <p>{e.amount / 100}€</p>
    ))}
  </PaymentPoolItemContainer>
)

const TotalAmount = ({ sum }: Record<'sum', number>) => (
  <>
    <p>===============</p>
    <PaymentPoolItemContainer>
      <p>Total</p>
      <p>{sum / 100}€</p>
    </PaymentPoolItemContainer>
  </>
)

const PayButtonWrapper = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
`

type PayButtonProps = {
  session: Session
}

const PayButton = ({ session }: PayButtonProps) => {
  const [paymentLoading, setPaymentLoading] = useState(false)
  const { items } = useContext(PaymentPool)

  if (paymentLoading) {
    return (
      <PayButtonWrapper>
        <Loading />
      </PayButtonWrapper>
    )
  }

  const handleClick = () => {
    setPaymentLoading(true)
    payEvents(items.map(i => i.eventId))
      .then(res => {
        res.ok && window.location.reload()
      })
      .catch(() => setPaymentLoading(false))
  }

  return (
    <PayButtonWrapper>
      <Button onClick={handleClick}>Pay now</Button>
      <p>
        {session.paymentMethod.brand} **** {session.paymentMethod.last4}
      </p>
    </PayButtonWrapper>
  )
}

export const PaymentTab = ({ session }: { session: Session }) => {
  const { items } = useContext(PaymentPool)

  return (
    <PaymentTabWrapper>
      <PaymentPoolContainer>
        <h3>Payment Pool</h3>
        {items.map(item => paymentPoolItem(item))}
        <TotalAmount
          sum={items.reduce((acc, item) => acc + item.items[0].amount, 0)}
        />
        <PayButton session={session} />
      </PaymentPoolContainer>
      <Link href="/update-payment-method">Update payment method</Link>
    </PaymentTabWrapper>
  )
}
