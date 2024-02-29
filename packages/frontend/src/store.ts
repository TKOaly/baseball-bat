import { configureStore } from '@reduxjs/toolkit';
import { TypedUseSelectorHook, useDispatch, useSelector } from 'react-redux';
import api from './api/rtk-api';
import sessionSlice from './session';
import paymentPool from './state/payment-pool';
import accountingPeriodSlice from './state/accounting-period';
import notificationsSlice from './state/notifications';

export const store = configureStore({
  reducer: {
    api: api.reducer,
    session: sessionSlice.reducer,
    paymentPool: paymentPool.reducer,
    accountingPeriod: accountingPeriodSlice.reducer,
    notifications: notificationsSlice.reducer,
  },
  middleware: getDefaultMiddleware =>
    getDefaultMiddleware({
      serializableCheck: false,
    }).concat(api.middleware),
  devTools: import.meta.env.NODE_ENV === 'development',
});

export type RootState = ReturnType<typeof store.getState>;

export type AppDispatch = typeof store.dispatch;

export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
