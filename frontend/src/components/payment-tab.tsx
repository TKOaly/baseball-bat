import { useContext, useState } from 'react';
import styled from 'styled-components';
import { Link } from 'wouter';
import { Session } from '@bbat/common/'types';
import { payEvents } from '../api';
import { PaymentPool, PaymentPoolItem } from '../state/payment-pool';
import { Button } from './button';
import { Loading } from './loading';

const PaymentTabWrapper = styled.div`
  height: 100%;
  display: flex;
  align-items: center;
  flex-direction: column;
  margin: 10px;
`;

const PaymentPoolContainer = styled.div`
  background: #ffffff;
  box-shadow: 1px 1px 10px rgba(0, 0, 0, 0.25);
  border-radius: 5px;
  width: 500px;
  margin: 2em;
  padding: 1em;

  @media (max-width: 1200px) {
    margin: 10px;
    width: 100%;
  }
`;
const PaymentPoolItemContainer = styled.div`
  font-family: 'Roboto Mono', monospace;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
`;

const paymentPoolItem = (item: PaymentPoolItem) => (
  <PaymentPoolItemContainer key={`${item.eventId}-pp`}>
    {item.items.map((e, i) => (
      <p key={`${item.eventId}-${i}-pp`}>
        {item.eventName} {e.itemName}
      </p>
    ))}
    {item.items.map((e, i) => (
      <p key={`${item.eventId}-${i}-pp-sum`}>{e.amount / 100}€</p>
    ))}
  </PaymentPoolItemContainer>
);

const TotalAmount = ({ sum }: Record<'sum', number>) => (
  <>
    <p>===============</p>
    <PaymentPoolItemContainer>
      <p>Total</p>
      <p>{sum / 100}€</p>
    </PaymentPoolItemContainer>
  </>
);

const PayButtonWrapper = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
`;

const CardInfo = styled.p`
  margin-left: 200px;
  font-family: 'Roboto Mono', monospace;
  width: 100%;
`;

type PayButtonProps = {
  session: Session;
};

const PayButton = ({ session }: PayButtonProps) => {
  const [paymentLoading, setPaymentLoading] = useState(false);
  const { items } = useContext(PaymentPool);

  if (paymentLoading) {
    return (
      <PayButtonWrapper>
        <Loading />
      </PayButtonWrapper>
    );
  }

  const handleClick = () => {
    setPaymentLoading(true);
    payEvents(items.map(i => i.eventId))
      .then(res => {
        res.ok && window.location.reload();
      })
      .catch(() => setPaymentLoading(false));
  };

  return (
    <PayButtonWrapper>
      <Button onClick={handleClick}>Pay now</Button>
      <CardInfo>
        {session.paymentMethod.brand} **** {session.paymentMethod.last4}
      </CardInfo>
    </PayButtonWrapper>
  );
};

export const PaymentTab = ({ session }: { session: Session }) => {
  const { items, totalSum } = useContext(PaymentPool);

  return (
    <PaymentTabWrapper>
      <h3>Payment Pool</h3>
      <PaymentPoolContainer>
        {items.map(item => paymentPoolItem(item))}
        <TotalAmount sum={totalSum} />
        <PayButton session={session} />
      </PaymentPoolContainer>
      <Link href="/update-payment-method">Update payment method</Link>
    </PaymentTabWrapper>
  );
};
