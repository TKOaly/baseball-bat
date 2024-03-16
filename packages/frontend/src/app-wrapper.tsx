import React, { Suspense, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Provider } from 'react-redux';
import { store } from './store';
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
import './style.css';
import { DialogContextProvider } from './components/dialog';
import { useAuthenticate, useSession } from './hooks/use-session';
import { PublicSite } from './views/public';

const LazyAdmin = React.lazy(() => import('./views/admin'));

const Routes = () => {
  const { i18n } = useTranslation();
  const session = useSession();
  const search = useSearch();
  const [location, navigate] = useLocation();
  const authenticate = useAuthenticate();

  useEffect(() => {
    const token = new URLSearchParams(search).get('token');

    if (token) {
      authenticate(token).then(() => {
        const redirect = localStorage.getItem('auth_redirect');
        localStorage.removeItem('auth_redirect');

        if (redirect) {
          navigate(redirect);
        }
      });
    }
  }, [navigate, authenticate, search]);

  useEffect(() => {
    const language = session.data?.preferences?.uiLanguage;

    if (language) {
      i18n.changeLanguage(language);
    }
  }, [session.data?.preferences?.uiLanguage]);

  const [isAuthPath] = useRoute('/auth/*?');

  useEffect(() => {
    const token = new URLSearchParams(search).get('token');

    if (!token) {
      localStorage.setItem('auth_redirect', location);
    }
  }, []);

  if (!session.isLoading) {
    if (!session.data?.accessLevel && !isAuthPath) {
      return <Redirect to="/auth" />;
    }

    if (session.data?.accessLevel && isAuthPath) {
      const redirect = localStorage.getItem('auth_redirect');
      localStorage.removeItem('auth_redirect');

      return <Redirect to={redirect ?? '/'} />;
    }
  }

  return (
    <Switch>
      <Route path="/admin/*" component={LazyAdmin} />
      <Route path="/auth" nest component={Landing} />
      <Route>
        <Provider store={store}>
          <PublicSite />
        </Provider>
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
