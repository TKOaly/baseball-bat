import React from 'react';
import { Elements } from '@stripe/react-stripe-js';
import { Session } from '../../common/types';
import { SmallContainer } from '../components/containers';
import { Loading } from '../components/loading';
import { PaymentForm } from '../components/payment-form';
import { useSetupIntent } from '../hooks';
import { getStripe } from '../stripe';

type Props = {
  session: Session
}

export const Onboarding = ({ session }: Props) => {
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
        <h1>Welcome, {session.user.screenName}!</h1>
        <p>Set up your card details</p>
        <PaymentForm />
      </SmallContainer>
    </Elements>
  );
};
