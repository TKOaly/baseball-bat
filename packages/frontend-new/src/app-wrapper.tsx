import React, { PropsWithChildren, Suspense, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Provider } from 'react-redux';
// import { NewPayment } from './views/new-payment';
import { store, useAppDispatch, useAppSelector } from './store';
import { PaymentSelectionSidebar } from './components/payment-selection-sidebar';
import { EmailAuth } from './views/email-auth';
// import { DebtDetails } from './views/debt-details';
// import { InvalidMagicLink } from './views/invalid-magic-link';
// import { PaymentDetails } from './views/payment-details';
// import { ConfirmEmailAuth } from './views/confirm-email-auth';
// import { Settings } from './views/settings';
import { Route, Switch, useLocation, useRoute } from 'wouter';
import { Loading } from '@bbat/ui/loading';
import { Landing } from './views/landing';
// import { Main } from './views/main';
import './style.css';
import {
  authenticateSession,
  bootstrapSession,
  createSession,
  destroySession,
  heartbeat,
} from './session';
import { Button } from '@bbat/ui/button';
import { DialogContextProvider } from './components/dialog';
// import { StripePaymentFlow } from './views/stripe-payment-flow';
// import { StripePaymentReturnPage } from './views/stripe-payment-return-page';

const Navigation = () => {
  const [, setLocation] = useLocation();
  const { t, i18n } = useTranslation();
  const session = useAppSelector(state => state.session);
  const dispatch = useAppDispatch();

  const handleLogOut = () => {
    dispatch(destroySession()).then(() => setLocation('/'));
  };

  return (
    <ul className="flex md:flex-col gap-2 px-3 items-stretch pt-5 w-full jusify-items-stretch">
      <li
        className="bg-gray-200 cursor-pointer rounded-lg py-2 px-3 flex-grow md:flex-grow-0 text-center md:text-left"
        onClick={() => setLocation('/')}
      >
        {t('navigation.debts')}
      </li>
      <li
        className="hover:bg-gray-100 cursor-pointer rounded-lg py-2 px-3 flex-grow text-center md:text-left md:flex-grow-0"
        onClick={() => setLocation('/settings')}
      >
        {t('navigation.settings')}
      </li>
      <li
        className="hover:bg-gray-100 cursor-pointer rounded-lg py-2 px-3 flex-grow text-center md:text-left md:flex-grow-0"
        onClick={() => handleLogOut()}
      >
        {t('navigation.logOut')}
      </li>
      {session.accessLevel === 'admin' && (
        <>
          <li className="w-[2px] md:w-auto md:h-[2px] bg-gray-100"></li>
          <li
            className="hover:bg-gray-100 cursor-pointer rounded-lg py-2 px-3 flex-grow text-center md:text-left md:flex-grow-0"
            onClick={() => setLocation('/admin/debt-centers')}
          >
            {t('navigation.administration')}
          </li>
        </>
      )}
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
  );
};

const PublicLayout: React.FC<PropsWithChildren<{ sidebars: boolean }>> = ({ children, sidebars }) => (
  <Provider store={store}>
    <div className="bg-[#fbfbfb] w-screen pb-10 min-h-screen justify-center md:pt-10 gap-5">
      <div className="grid justify-center gap-5 grid-cols-1 md:grid-cols-main">
        <h1 className="text-center md:mb-5 hidden md:block text-3xl font-bold text-gray-600 md:col-span-3">
          TKO-äly ry - Maksupalvelu
        </h1>
        <div className="flex md:justify-end">{sidebars && <Navigation />}</div>
        <div className="mx-3 md:max-w-[40em] md:w-[40em] flex flex-col items-stretch">
          <div className="rounded-lg bg-white border border-gray-100 shadow-lg flex-grow p-5">
            {children}
          </div>
        </div>
        <div className="md:block">
          {sidebars && <PaymentSelectionSidebar />}
        </div>
      </div>
      <div className="fixed bottom-0 md:hidden flex items-center bg-white border-t shadow py-2 px-3 w-full">
        <div className="flex-grow">
          Valittu 2 maksua.
          <br /> Yhteensä 33,00 euroa.
        </div>
        <Button>Siiry maksamaan</Button>
      </div>
    </div>
  </Provider>
);

const LazyAdmin = () => <div /> // React.lazy(() => import('./views/admin'));

const useManageSession = () => {
  const authToken = new URLSearchParams(window.location.search).get('token');
  const [location, setLocation] = useLocation();
  const { bootstrapping, token, authenticated, creatingSession } =
    useAppSelector(state => state.session);
  const dispatch = useAppDispatch();

  const [isMagicInvalid] = useRoute('/magic/invalid');
  const [isAuth] = useRoute('/auth');

  const allowUnauthenticated = isMagicInvalid || isAuth;

  useEffect(() => {
    if (token) {
      const id = setInterval(() => {
        dispatch(heartbeat());
      }, 60 * 1000);

      return () => clearInterval(id);
    }
  }, [token]);

  useEffect(() => {
    if (bootstrapping === 'pending') {
      dispatch(bootstrapSession());
    } else if (bootstrapping === 'completed') {
      if (!authenticated) {
        if (authToken) {
          const redirect = window.localStorage.getItem('redirect') ?? '/';

          dispatch(authenticateSession(authToken)).then(() => {
            setLocation(redirect);
          });
        } else {
          console.log(allowUnauthenticated);
          if (!allowUnauthenticated) {
            setLocation('/auth');
          }
        }
      }

      if (!token && !creatingSession) {
        dispatch(createSession()).then(() => {
          window.localStorage.setItem('redirect', location);
          setLocation('/auth');
        });
      }
    }
  }, [bootstrapping, token, authToken, creatingSession, allowUnauthenticated]);
};

const Routes = () => {
  const { i18n } = useTranslation();
  const [isAdminRoute] = useRoute('/admin/:rest*');
  const session = useAppSelector(state => state.session);

  useManageSession();

  useEffect(() => {
    if (session?.preferences?.uiLanguage) {
      i18n.changeLanguage(session.preferences.uiLanguage);
    }
  }, [session?.preferences?.uiLanguage]);

  if (session.bootstrapping !== 'completed') {
    return <Loading />;
  }

  if (isAdminRoute && session.authenticated) {
    return <LazyAdmin />;
  }

  return (
    <PublicLayout sidebars={session.authenticated}>
      <Switch>
        <Route path="/auth" component={Landing} />
        <Route path="/auth/email" component={EmailAuth} />
        {/*<Route path="/auth/email/confirm/:id" component={ConfirmEmailAuth} />
        <Route path="/magic/invalid" component={InvalidMagicLink} />
        {session.authenticated && (
          <>
            <Route path="/">
              <Main />
            </Route>
            <Route path="/settings">
              <Settings />
            </Route>
            <Route path="/debt/:id" component={DebtDetails} />
            <Route path="/payment/new" component={NewPayment} />
            <Route path="/payment/:id" component={PaymentDetails} />
            <Route
              path="/payment/:id/stripe/:secret"
              component={StripePaymentFlow}
            />
            <Route
              path="/payment/:id/stripe/:secret/return"
              component={StripePaymentReturnPage}
            />
          </>
        )*/}
      </Switch>
    </PublicLayout>
  );
};

export const AppWrapper = () => {
  return (
    <DialogContextProvider>
      <Provider store={store}>
        <Suspense fallback={<Loading />}>
          <Routes />
        </Suspense>
      </Provider>
    </DialogContextProvider>
  );
};
