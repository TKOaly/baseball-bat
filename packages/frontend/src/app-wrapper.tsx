import React, { Suspense, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Provider } from 'react-redux';
import { store } from './store';
import { Redirect, Route, Switch, useRoute, useSearch } from 'wouter';
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
