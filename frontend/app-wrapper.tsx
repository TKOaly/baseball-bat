import React, { Suspense, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Provider } from 'react-redux'
import { NewPayment } from './views/new-payment'
import { store, useAppDispatch, useAppSelector } from './store'
import { PaymentSelectionSidebar } from './components/payment-selection-sidebar'
import { EmailAuth } from './views/email-auth'
import { PaymentDetails } from './views/payment-details'
import { ConfirmEmailAuth } from './views/confirm-email-auth'
import { Settings } from './views/settings'
import { Route, useLocation, useRoute } from 'wouter'
import { Loading } from './components/loading'
import { Landing } from './views/landing'
import { Main } from './views/main'
import { Onboarding } from './views/onboarding'
import { UpdatePaymentMethod } from './views/update-payment-method'
import './style.css'
import { authenticateSession, bootstrapSession, createSession } from './session'
import { Button } from './components/button'

const Navigation = () => {
  const [, setLocation] = useLocation()
  const { t, i18n } = useTranslation()
  const session = useAppSelector((state) => state.session)

  return (
    <ul className="flex md:flex-col gap-2 px-3 items-stretch pt-5 w-full jusify-items-stretch">
      <li
        className="bg-gray-200 cursor-pointer rounded-lg py-2 px-3 flex-grow md:flex-grow-0 text-center md:text-left"
        onClick={() => setLocation(`/`)}
      >
        {t('navigation.debts')}
      </li>
      <li
        className="hover:bg-gray-100 cursor-pointer rounded-lg py-2 px-3 flex-grow text-center md:text-left md:flex-grow-0"
        onClick={() => setLocation('/settings')}
      >
        {t('navigation.settings')}
      </li>
      {
        session.accessLevel === 'admin' && (
          <>
            <li className="w-[2px] md:w-auto md:h-[2px] bg-gray-100"></li>
            <li className="hover:bg-gray-100 cursor-pointer rounded-lg py-2 px-3 flex-grow text-center md:text-left md:flex-grow-0" onClick={() => setLocation(`/admin/debt-centers`)}>{t('navigation.administration')}</li>
          </>
        )
      }
      <>
        <li className="w-[2px] md:w-auto md:h-[2px] bg-gray-100"></li>
        <li
          className={`
            hover:bg-gray-100 cursor-pointer rounded-lg py-2 px-3 flex-grow text-center md:text-left md:flex-grow-0
            ${i18n.language === 'fi' && 'bg-gray-200'}
          `}
          onClick={() => i18n.changeLanguage('fi')}
        >
          Suomeksi
        </li>
        <li
          className={`
            hover:bg-gray-100 cursor-pointer rounded-lg py-2 px-3 flex-grow text-center md:text-left md:flex-grow-0
            ${i18n.language === 'en' && 'bg-gray-200'}
          `}
          onClick={() => i18n.changeLanguage('en')}
        >
          In English
        </li>
      </>
    </ul>
  )
}

const PublicLayout = ({ children, sidebars }) => (
  <Provider store={store}>
    <div className="bg-[#fbfbfb] w-screen h-screen justify-center md:pt-10 gap-5">
      <div className="grid justify-center gap-5 grid-cols-1 md:grid-cols-main">
        <h1 className="text-center md:mb-5 hidden md:block text-3xl font-bold text-gray-600 md:col-span-3">TKO-äly ry - Maksupalvelu</h1>
        <div className="flex md:justify-end">
          {sidebars && <Navigation />}
        </div>
        <div className="mx-3 md:max-w-[40em] md:w-[40em] flex flex-col items-stretch">
          <div className="rounded-lg bg-white border border-gray-100 shadow-lg flex-grow p-5">
            {children}
          </div>
        </div>
        <div className="md:block">
          <PaymentSelectionSidebar />
        </div>
      </div>
      <div className="fixed bottom-0 md:hidden flex items-center bg-white border-t shadow py-2 px-3 w-full">
        <div className="flex-grow">Valittu 2 maksua.<br /> Yhteensä 33,00 euroa.</div>
        <Button>Siiry maksamaan</Button>
      </div>
    </div>
  </Provider>
);

const LazyAdmin = React.lazy(() => import('./views/admin'))

const Routes = () => {
  const { i18n } = useTranslation()
  const [isAdminRoute] = useRoute('/admin/:rest*')
  const [isAuthRoute] = useRoute('/auth/:rest*')
  const [location, setLocation] = useLocation()
  const dispatch = useAppDispatch()
  const authToken = new URLSearchParams(window.location.search).get('token')
  const [authenticating, setAuthenticating] = useState(false)
  const session = useAppSelector((state) => state.session)

  useEffect(() => {
    if (session.bootstrapping === 'pending') {
      dispatch(bootstrapSession())
    }
  }, [session.bootstrapping])

  const token = useAppSelector((state) => state.session.token)

  if (!token && !isAuthRoute) {
    //setLocation('/auth');
  }

  useEffect(() => {
    if (session?.preferences?.uiLanguage) {
      i18n.changeLanguage(session.preferences.uiLanguage);
    }
  }, [session?.preferences?.uiLanguage])

  useEffect(() => {
    if (!token && session.bootstrapping === 'completed' && !session.token) {
      dispatch(createSession())
    }
  }, [token, session])

  if (session.bootstrapping !== 'completed') {
    return (
      <Loading />
    )
  }

  if (session.bootstrapping === 'completed' && !session.authenticated && authToken) {
    dispatch(authenticateSession(authToken))
      .then(() => {
        const redirect = window.localStorage.getItem('redirect') ?? '/'
        setLocation(redirect);
      })

    return <Loading />
  }

  if (isAdminRoute && session.authenticated) {
    return <LazyAdmin />
  }

  if (!session?.authenticated && !isAuthRoute) {
    window.localStorage.setItem('redirect', location);
    setLocation('/auth');
  }

  return (
    <PublicLayout sidebars={session.authenticated}>
      <Route path="/auth" component={Landing} />
      <Route path="/auth/email" component={EmailAuth} />
      <Route path="/auth/email/confirm/:id" component={ConfirmEmailAuth} />
      {session.authenticated && (
        <>
          <Route path="/onboarding">
            <Onboarding session={session as any} />
          </Route>
          <Route path="/">
            <Main session={session as any} />
          </Route>
          <Route path="/settings">
            <Settings session={session as any} />
          </Route>
          <Route path="/payment/new" component={NewPayment} />
          <Route path="/payment/:id/details" component={PaymentDetails} />
          <Route path="/update-payment-method">
            <UpdatePaymentMethod session={session as any} />
          </Route>
        </>
      )}
    </PublicLayout>
  );
}

export const AppWrapper = () => {
  return (
    <Provider store={store}>
      <Suspense fallback={<Loading />}>
        <Routes />
      </Suspense>
    </Provider>
  )
}
