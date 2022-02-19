import { PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { Stripe, StripeElements } from '@stripe/stripe-js'
import styled from 'styled-components'
import { Button } from './button'

const CardForm = styled.form`
  width: 80%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  margin-top: 2em;
`
const handleSubmit =
  (stripe: Stripe, elements: StripeElements) =>
  async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!stripe || !elements) {
      return
    }

    const result = await stripe.confirmSetup({
      redirect: 'always',
      elements,
      confirmParams: {
        return_url: `${process.env.APP_URL}/api/session/confirm-card-setup`,
      },
    })

    if (result.error) {
      // Show error to your customer (for example, payment details incomplete)
      console.log(result.error.message)
    } else {
      // Your customer will be redirected to your `return_url`. For some payment
      // methods like iDEAL, your customer will be redirected to an intermediate
      // site first to authorize the payment, then redirected to the `return_url`.
    }
  }

export const PaymentForm = () => {
  const stripe = useStripe()
  const elements = useElements()

  return (
    <CardForm onSubmit={handleSubmit(stripe, elements)}>
      <PaymentElement />
      <Button type="submit">Save</Button>
    </CardForm>
  )
}
