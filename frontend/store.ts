import { configureStore } from '@reduxjs/toolkit';
import { TypedUseSelectorHook, useDispatch, useSelector } from 'react-redux';
import api from './api/rtk-api';
import sessionSlice from './session';
import paymentPool from './state/payment-pool';
import accountingPeriodSlice from './state/accounting-period';

export const store = configureStore({
  reducer: {
    api: api.reducer,
    session: sessionSlice.reducer,
    paymentPool: paymentPool.reducer,
    accountingPeriod: accountingPeriodSlice.reducer,
  },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(api.middleware),
  devTools: process.env.NODE_ENV === 'development',
});

export type RootState = ReturnType<typeof store.getState>

export type AppDispatch = typeof store.dispatch

export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
