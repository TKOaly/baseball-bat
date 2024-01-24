import { PayerProfile } from '@bbat/common/src/types';
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
    if (session.token === null) {
      dispatch(createSession());
    } else {
      console.log(session);
      dispatch(refreshSession());
    }

    return {
      data: null,
      isLoading: true,
    };
  }

  if (session.status === SessionStatus.COMPLETED) {
    if (session.data === null) {
      dispatch(refreshSession());

      return {
        data: null,
        isLoading: true,
      };
    }

    return {
      data: session.data,
      isLoading: false,
    };
  }

  return {
    data: null,
    isLoading: false,
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
