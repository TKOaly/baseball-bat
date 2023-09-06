import { useEffect, useState } from 'react';
import { useLocation, useRoute } from 'wouter';
import {
  DebtCenter,
  EventWithPaymentStatus,
  Session,
} from '../../common/types';
import {
  getDebtCenters,
  getEvents,
  getSession,
  getSetupIntent,
  RequestError,
} from '../api';

const handleRequestError =
  (setLocation: (loc: string) => void) => (error: RequestError) => {
    const [isAuthRoute] = useRoute('/auth/:rest*');

    switch (error.status) {
      case 401:
        localStorage.removeItem('bbat_token');

        if (!isAuthRoute) {
          setLocation('/auth');
        }

        break;
      default:
        console.error('Request failed', error);
    }
  };

export const useEvents = () => {
  const [events, setEvents] = useState<EventWithPaymentStatus[] | null>(null);
  const setLocation = useLocation()[1];

  useEffect(() => {
    getEvents().then(setEvents).catch(handleRequestError(setLocation));
  }, []);

  return events;
};

export const useDebtCenters = () => {
  const [debtCenters, setDebtCenters] = useState<DebtCenter[] | null>(null);
  const setLocation = useLocation()[1];

  useEffect(() => {
    getDebtCenters()
      .then(setDebtCenters)
      .catch(handleRequestError(setLocation));
  }, []);

  return debtCenters;
};

export const loadTokenAndSession = (): {
  session: Session | null;
  loading: boolean;
} => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [, setLocation] = useLocation();
  const [isAuthRoute] = useRoute('/auth/:rest*');

  console.log('Auth?', isAuthRoute);

  useEffect(() => {
    if (!localStorage.getItem('bbat_token')) {
      const token = location.search.split('token=')[1]?.split('&')[0] ?? null;
      if (token === null) {
        setLoading(false);
        if (!isAuthRoute) {
          setLocation('/auth');
        }
      }

      localStorage.setItem('bbat_token', token);
      location.search = '';
    }

    getSession()
      .then(session => {
        setSession(session);
        setLoading(false);
      })
      .catch(error => {
        setLoading(false);
        handleRequestError(setLocation)(error);
      });
  }, []);

  return { session, loading };
};

export const useSetupIntent = () => {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const setLocation = useLocation()[1];

  useEffect(() => {
    getSetupIntent()
      .then(({ secret }) => setClientSecret(secret))
      .catch(handleRequestError(setLocation));
  }, []);

  return clientSecret;
};
