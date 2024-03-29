import { useAppSelector, useAppDispatch } from '../store';
import {
  SessionData,
  SessionStatus,
  authenticateSession,
  createSession,
  destroySession,
  refreshSession,
} from '../session';
import { useCallback } from 'react';

export type Session = {
  data: SessionData | null;
  isLoading: boolean;
};

export const useSession = (): Session => {
  const session = useAppSelector(state => state.session);
  const dispatch = useAppDispatch();

  if (session.status === SessionStatus.INVALID) {
    if (session.token) {
      dispatch(refreshSession());
    } else {
      dispatch(createSession());
    }
  }

  return {
    data: session.data,
    isLoading:
      session.status === SessionStatus.CREATING ||
      session.status === SessionStatus.REFRESHING,
  };
};

export type AuthenticateFn = (token: string) => Promise<void>;

export const useAuthenticate = (): AuthenticateFn => {
  const dispatch = useAppDispatch();

  const fn = useCallback(
    async (token: string) => {
      await dispatch(authenticateSession(token));
    },
    [dispatch],
  );

  return fn;
};

export type DeauthenticateFn = () => Promise<void>;

export const useDeauthenticate = () => {
  const dispatch = useAppDispatch();

  const fn = useCallback(async () => {
    await dispatch(destroySession());
  }, [dispatch]);

  return fn;
};
