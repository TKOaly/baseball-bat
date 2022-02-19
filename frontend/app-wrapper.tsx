import React from 'react'
import styled from 'styled-components'
import { Route, useLocation } from 'wouter'
import { Session } from '../common/types'
import { Loading } from './components/loading'
import { loadTokenAndSession } from './hooks'
import { Landing } from './views/landing'
import { Main } from './views/main'
import { Onboarding } from './views/onboarding'
import { UpdatePaymentMethod } from './views/update-payment-method'

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background-color: #ffcc33;
  width: 100vw;
  height: 100vh;
`

const router = (session: Session | null) => (
  <>
    <Route path="/landing">
      <Landing />
    </Route>
    {session !== null && (
      <>
        <Route path="/onboarding">
          <Onboarding session={session} />
        </Route>
        <Route path="/">
          <Main session={session} />
        </Route>
        <Route path="/update-payment-method">
          <UpdatePaymentMethod session={session} />
        </Route>
      </>
    )}
  </>
)

export const AppWrapper = () => {
  const { loading, session } = loadTokenAndSession()

  if (loading) {
    return (
      <Wrapper>
        <Loading />
      </Wrapper>
    )
  }

  return <Wrapper>{router(session)}</Wrapper>
}
