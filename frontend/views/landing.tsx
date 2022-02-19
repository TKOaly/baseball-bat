import { ButtonA } from '../components/button'
import { SmallContainer } from '../components/containers'

export const Landing = () => (
  <SmallContainer>
    <h1>Welcome to TKO-äly debt</h1>
    <p>
      Debt platform is a centralized place for paying for TKO-äly events by card
    </p>
    <ButtonA href="/api/session/login">Login</ButtonA>
  </SmallContainer>
)
