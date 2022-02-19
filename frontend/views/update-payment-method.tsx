import { useLocation } from 'wouter'
import { Session } from '../../common/types'
import { useSetupIntent } from '../hooks'
import { SmallContainer } from '../components/containers'
import { Loading } from '../components/loading'
import { Elements } from '@stripe/react-stripe-js'
import { getStripe } from '../stripe'
import { PaymentForm } from '../components/payment-form'
import styled from 'styled-components'
import { BackLink } from '../components/button'

type Props = {
  session: Session | null
}

const NavContainer = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: flex-start;
`

export const UpdatePaymentMethod = ({ session }: Props) => {
  const clientSecret = useSetupIntent()

  if (!clientSecret) {
    return (
      <SmallContainer>
        <Loading />
      </SmallContainer>
    )
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
  )
}
