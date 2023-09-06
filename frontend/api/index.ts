import {
  Session,
  DebtCenter,
  EventWithPaymentStatus,
} from '../../common/types';
import { BACKEND_URL } from '../config';

type RequestMethods =
  | 'GET'
  | 'OPTIONS'
  | 'HEAD'
  | 'POST'
  | 'PUT'
  | 'DELETE'
  | 'CONNECT'
  | 'TRACE'
  | 'PATCH';

export type RequestError = {
  status: number;
  statusText: string;
};

const getAuthToken = () => {
  const maybeToken = localStorage.getItem('bbat_token');
  if (!maybeToken) return Promise.resolve(null);
  return Promise.resolve(maybeToken);
};

const request = async <T>(
  method: RequestMethods,
  url: string,
  auth = true,
  data?: any,
): Promise<T> =>
  fetch(`${BACKEND_URL}${url}`, {
    method,
    headers: Object.assign(
      {
        'Content-Type': 'application/json',
      },
      auth ? { Authorization: `Bearer ${await getAuthToken()}` } : {},
    ),
    body: data ? JSON.stringify(data) : undefined,
  }).then(res => {
    if (res.ok) return res.json();
    throw { status: res.status, statusText: res.statusText };
  });

export const getSession = () => request<Session>('GET', '/api/session');

export const getSetupIntent = () =>
  request<{ secret: string }>('GET', '/api/session/setup-intent');

export const getEvents = () =>
  request<EventWithPaymentStatus[]>('GET', '/api/events');

export const payEvents = (events: number[]) =>
  request<{ ok: boolean }>('POST', '/api/events/pay', true, { events });

export const getDebtCenters = () =>
  request<DebtCenter[]>('GET', '/api/debtCenters');
