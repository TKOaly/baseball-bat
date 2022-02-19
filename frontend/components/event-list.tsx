import { useContext } from 'react'
import styled from 'styled-components'
import { EventWithPaymentStatus } from '../../common/types'
import { PaymentPool } from '../state/payment-pool'
import { Button, RedButton } from './button'

const ConatentWrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 70%;
`

const List = styled.div`
  overflow: auto;
  height: 45rem;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
`

const Item = styled.div<{ paid: boolean }>`
  background: #ffffff;
  box-shadow: 1px 1px 10px rgba(0, 0, 0, 0.25);
  border-radius: 5px;
  width: 80%;
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  margin: 40px 0;
  opacity: ${(props: any) => (props.paid ? 0.5 : 1)};
`

const EventInfo = styled.div`
  display: flex;
  flex-direction: column;
  margin-left: 10px;
`

const PriceAndCTA = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-right: 10px;
  width: 300px;
`

type Props = {
  events: EventWithPaymentStatus[]
}

const eventItem = (event: EventWithPaymentStatus) => {
  const { dispatch, items } = useContext(PaymentPool)
  const poolHasItem = items.some(item => item.eventId === event.id)

  const ctaButton = () => {
    const dispatchPayload = {
      type: poolHasItem
        ? 'REMOVE_ITEM'
        : ('ADD_ITEM' as 'REMOVE_ITEM' | 'ADD_ITEM'),
      payload: {
        eventId: event.id,
        eventName: event.name,
        items: [
          {
            eventItemId: 0,
            itemName: 'Attendance',
            amount: event.price.value,
          },
        ],
      },
    }

    return poolHasItem ? (
      <RedButton onClick={() => dispatch(dispatchPayload)}>
        Remove from pool
      </RedButton>
    ) : (
      <Button onClick={() => dispatch(dispatchPayload)}>Add to pool</Button>
    )
  }

  const isPaid = event.payment?.status === 'succeeded'

  return (
    <Item paid={isPaid}>
      <EventInfo>
        <h3>{event.name}</h3>
        <p>{new Date(event.starts).toUTCString()}</p>
        <p>{event.location}</p>
        {event.payment ? <p>Payment status: {event.payment.status}</p> : null}
      </EventInfo>
      <PriceAndCTA>
        <h2>{event.price.value / 100}€</h2>
        {ctaButton()}
      </PriceAndCTA>
    </Item>
  )
}

export const EventList = ({ events }: Props) => {
  return (
    <ConatentWrapper>
      <List>{events.map(event => eventItem(event))}</List>
    </ConatentWrapper>
  )
}
