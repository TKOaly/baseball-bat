import { createSelector } from '@reduxjs/toolkit';
import { format } from 'date-fns';
import { useEffect } from 'react';
import { formatEuro } from '../../common/currency';
import debtApi from '../api/debt';
import debtCentersApi from '../api/debt-centers';
import payersApi from '../api/payers';
import paymentsApi from '../api/payments';
import { useAppSelector, useAppDispatch } from '../store';

const selectResourceDetails = createSelector(
  [
    (state) => state,
    (_state, type: string) => type,
    (_state, _type, id: string) => id,
  ],
  (state, type, id) => {
    let name: string;
    const details = [];

    if (type === 'debt') {
      const debt = debtApi.endpoints.getDebt.select(id)(state);

      if (!debt.data) {
        return null;
      }

      name = debt.data.name;

      details.push(
        ['Created', format(debt.data.createdAt, 'dd.MM.yyyy')],
        ['Due date', format(debt.data.dueDate, 'dd.MM.yyyy')],
        ['Payer', debt.data.payer.name],
        ['Amount', formatEuro(debt.data.total)],
      );
    } else if (type === 'payer') {
      const payer = payersApi.endpoints.getPayer.select(id)(state);

      if (!payer.data) {
        return null;
      }

      if (payer.data.disabled) {
        details.push(['Status', 'Disabled']);
      }

      details.push(
        ['Member', payer.data.tkoalyUserId?.value ? 'Yes' : 'No'],
        ...payer.data.emails.map(({ email }) => ['Email', email]),
      );

      name = payer.data?.name;
    } else if (type === 'debt_center') {
      const debt_center = debtCentersApi.endpoints.getDebtCenter.select(id)(state);
      name = debt_center.data?.name;
    } else if (type === 'payment') {
      const payment = paymentsApi.endpoints.getPayment.select(id)(state);
      name = payment.data?.title;

      if (!payment.data) {
        return null;
      }

      details.push(['Number', payment.data.payment_number]);

      if (isPaymentInvoice(payment.data)) {
        details.push(['Reference', payment.data.data.reference_number]);
      }
    } else {
      return null;
    }

    return {
      id,
      type,
      name,
      details,
    };
  },
);

export const useFetchResourceDetails = (type: string, id: string, skip = false) => {
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (skip) {
      return;
    }

    if (type === 'debt') {
      dispatch(debtApi.endpoints.getDebt.initiate(id));
    } else if (type === 'payer') {
      dispatch(payersApi.endpoints.getPayer.initiate(id));
    } else if (type === 'debt_center') {
      dispatch(debtCentersApi.endpoints.getDebtCenter.initiate(id));
    } else if (type === 'payment') {
      dispatch(paymentsApi.endpoints.getPayment.initiate(id));
    }
  }, [type, id, skip]);

  return useAppSelector((state) => selectResourceDetails(state, type, id));
};

