import React, { PropsWithChildren, Suspense, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Provider } from 'react-redux';
import { NewPayment } from './views/new-payment';
import { store } from './store';
import { PaymentSelectionSidebar } from './components/payment-selection-sidebar';
import { EmailAuth } from './views/email-auth';
import { DebtDetails } from './views/debt-details';
// import { InvalidMagicLink } from './views/invalid-magic-link';
import { PaymentDetails } from './views/payment-details';
import { ConfirmEmailAuth } from './views/confirm-email-auth';
import { Settings } from './views/settings';
import {
  Redirect,
  Route,
  Switch,
  useLocation,
  useRoute,
  useSearch,
} from 'wouter';
import { Loading } from '@bbat/ui/loading';
import { Landing } from './views/landing';
import { Main } from './views/main';
import './style.css';
import { Button } from '@bbat/ui/button';
import { DialogContextProvider } from './components/dialog';
import { StripePaymentFlow } from './views/stripe-payment-flow';
import { StripePaymentReturnPage } from './views/stripe-payment-return-page';
import {
  useAuthenticate,
  useDeauthenticate,
  useSession,
} from './hooks/use-session';

const Navigation = () => {
  const [, setLocation] = useLocation();
  const { t, i18n } = useTranslation();
  const session = useSession();
  const deauthenticate = useDeauthenticate();

  const handleLogOut = async () => {
    await deauthenticate();
    setLocation('/');
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
      {session.data?.accessLevel === 'admin' && (
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

const PublicLayout: React.FC<PropsWithChildren<{ sidebars: boolean }>> = ({
  children,
  sidebars,
}) => (
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

const LazyAdmin = React.lazy(() => import('./views/admin'));

const Routes = () => {
  const { i18n } = useTranslation();
  const session = useSession();
  const search = useSearch();
  const authenticate = useAuthenticate();

  useEffect(() => {
    const token = new URLSearchParams(search).get('token');

    if (token) {
      authenticate(token);
    }
  }, [authenticate, search]);

  useEffect(() => {
    const language = session.data?.preferences?.uiLanguage;

    if (language) {
      i18n.changeLanguage(language);
    }
  }, [session.data?.preferences?.uiLanguage]);

  const [isAuthPath1] = useRoute('/auth*');
  const [isAuthPath2] = useRoute('/auth/*');

  const isAuthPath = isAuthPath1 || isAuthPath2;

  if (!session.isLoading) {
    if (!session.data?.accessLevel && !isAuthPath) {
      return <Redirect to="/auth" />;
    }

    if (session.data?.accessLevel && isAuthPath) {
      return <Redirect to="/" />;
    }
  }

  return (
    <Switch>
      <Route path="/admin/*">
        <LazyAdmin />
      </Route>
      <Route>
        <PublicLayout sidebars={!!session.data?.accessLevel}>
          <Switch>
            <Route path="/auth" component={Landing} />
            <Route path="/auth/email" component={EmailAuth} />
            <Route
              path="/auth/email/confirm/:id"
              component={ConfirmEmailAuth}
            />
            {/*<Route path="/magic/invalid" component={InvalidMagicLink} />*/}
            {session.data !== null && (
              <>
                <Route path="/">
                  <Main />
                </Route>
                <Route path="/settings" component={Settings} />
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
            )}
          </Switch>
        </PublicLayout>
      </Route>
    </Switch>
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
