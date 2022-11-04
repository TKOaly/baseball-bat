import React from 'react';
import { useSetupIntent } from '../hooks';
import { SmallContainer } from '../components/containers';
import { Loading } from '../components/loading';
import { Elements } from '@stripe/react-stripe-js';
import { getStripe } from '../stripe';
import { PaymentForm } from '../components/payment-form';
import styled from 'styled-components';
import { BackLink } from '../components/button';

const NavContainer = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: flex-start;
`;

export const UpdatePaymentMethod = () => {
  const clientSecret = useSetupIntent();

  if (!clientSecret) {
    return (
      <SmallContainer>
        <Loading />
      </SmallContainer>
    );
  }

  return (
    <Elements stripe={getStripe()} options={{ clientSecret }}>
      <SmallContainer>
        <h1>Update payment method</h1>
        <PaymentForm />
        <NavContainer>
          <BackLink href="/">Back</BackLink>
        </NavContainer>
      </SmallContainer>
    </Elements>
  );
};
