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
    <ul className="jusify-items-stretch flex w-full items-stretch gap-2 px-3 pt-5 md:flex-col">
      <li
        className="flex-grow cursor-pointer rounded-lg bg-gray-200 px-3 py-2 text-center md:flex-grow-0 md:text-left"
        onClick={() => setLocation('/')}
      >
        {t('navigation.debts')}
      </li>
      <li
        className="flex-grow cursor-pointer rounded-lg px-3 py-2 text-center hover:bg-gray-100 md:flex-grow-0 md:text-left"
        onClick={() => setLocation('/settings')}
      >
        {t('navigation.settings')}
      </li>
      <li
        className="flex-grow cursor-pointer rounded-lg px-3 py-2 text-center hover:bg-gray-100 md:flex-grow-0 md:text-left"
        onClick={() => handleLogOut()}
      >
        {t('navigation.logOut')}
      </li>
      {session.data?.accessLevel === 'admin' && (
        <>
          <li className="w-[2px] bg-gray-100 md:h-[2px] md:w-auto"></li>
          <li
            className="flex-grow cursor-pointer rounded-lg px-3 py-2 text-center hover:bg-gray-100 md:flex-grow-0 md:text-left"
            onClick={() => setLocation('/admin/debt-centers')}
          >
            {t('navigation.administration')}
          </li>
        </>
      )}
      <>
        <li className="w-[2px] bg-gray-100 md:h-[2px] md:w-auto"></li>
        <li
          className={`
            flex-grow cursor-pointer rounded-lg px-3 py-2 text-center hover:bg-gray-100 md:flex-grow-0 md:text-left
            ${i18n.language === 'fi' && 'bg-gray-200'}
          `}
          onClick={() => i18n.changeLanguage('fi')}
        >
          Suomeksi
        </li>
        <li
          className={`
            flex-grow cursor-pointer rounded-lg px-3 py-2 text-center hover:bg-gray-100 md:flex-grow-0 md:text-left
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
    <div className="min-h-screen w-screen justify-center gap-5 bg-[#fbfbfb] pb-10 md:pt-10">
      <div className="md:grid-cols-main grid grid-cols-1 justify-center gap-5">
        <h1 className="hidden text-center text-3xl font-bold text-gray-600 md:col-span-3 md:mb-5 md:block">
          TKO-äly ry - Maksupalvelu
        </h1>
        <div className="flex md:justify-end">{sidebars && <Navigation />}</div>
        <div className="mx-3 flex flex-col items-stretch md:w-[40em] md:max-w-[40em]">
          <div className="flex-grow rounded-lg border border-gray-100 bg-white p-5 shadow-lg">
            {children}
          </div>
        </div>
        <div className="md:block">
          {sidebars && <PaymentSelectionSidebar />}
        </div>
      </div>
      <div className="fixed bottom-0 flex w-full items-center border-t bg-white px-3 py-2 shadow md:hidden">
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
