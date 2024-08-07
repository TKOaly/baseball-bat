import { createSelector } from '@reduxjs/toolkit';
import { format } from 'date-fns/format';
import { parseISO } from 'date-fns/parseISO';
import { useEffect } from 'react';
import { formatEuro } from '@bbat/common/src/currency';
import { isPaymentInvoice } from '@bbat/common/src/types';
import debtApi from '../api/debt';
import debtCentersApi from '../api/debt-centers';
import payersApi from '../api/payers';
import paymentsApi from '../api/payments';
import { useAppSelector, useAppDispatch } from '../store';
import statementsApi from '../api/banking/statements';

export const ResourceLink = Symbol('RESOURCE_LINK');

const selectResourceDetails = createSelector(
  [
    state => state,
    (_state, type: string) => type,
    (_state, _type, id: string) => id,
  ],
  (state, type, id) => {
    let name = '';
    let value: unknown;

    const details: Array<
      [
        string,
        (
          | { type: 'text'; value: string }
          | { type: 'resource'; resourceType: string; id: string }
        ),
      ]
    > = [];

    if (type === 'debt') {
      const debt = debtApi.endpoints.getDebt.select(id)(state);
      value = debt.data;

      if (!debt.data) {
        return null;
      }

      name = debt.data.name;

      details.push(
        [
          'Created',
          { type: 'text', value: format(debt.data.createdAt, 'dd.MM.yyyy') },
        ],
        [
          'Payer',
          {
            type: 'resource',
            resourceType: 'payer',
            id: debt.data.payer.id.value,
          },
        ],
      );

      if (debt.data.total) {
        details.push([
          'Amount',
          { type: 'text', value: formatEuro(debt.data.total) },
        ]);
      }

      if (debt.data.dueDate) {
        details.push([
          'Due date',
          { type: 'text', value: format(debt.data.dueDate, 'dd.MM.yyyy') },
        ]);
      }

      if (debt.data.date) {
        details.push([
          'Date',
          { type: 'text', value: format(debt.data.date, 'dd.MM.yyyy') },
        ]);
      }
    } else if (type === 'payer') {
      const payer = payersApi.endpoints.getPayer.select(id)(state);
      value = payer.data;

      if (!payer.data) {
        return null;
      }

      if (payer.data.disabled) {
        details.push(['Status', { type: 'text', value: 'Disabled' }]);
      }

      details.push(
        [
          'Member',
          {
            type: 'text',
            value: payer.data.tkoalyUserId?.value ? 'Yes' : 'No',
          },
        ],
        ...payer.data.emails.map(
          ({ email }) =>
            ['Email', { type: 'text', value: email }] as [
              string,
              { type: 'text'; value: string },
            ],
        ),
      );

      name = payer.data?.name;
    } else if (type === 'debt_center') {
      const debt_center =
        debtCentersApi.endpoints.getDebtCenter.select(id)(state);

      if (!debt_center.data) {
        return null;
      }

      name = debt_center.data.name;
      value = debt_center.data;
    } else if (type === 'payment') {
      const payment = paymentsApi.endpoints.getPayment.select(id)(state);

      if (!payment.data) {
        return null;
      }

      name = payment.data.title;
      value = payment.data;

      details.push([
        'Number',
        { type: 'text', value: '' + payment.data.paymentNumber },
      ]);
      details.push([
        'Balance',
        { type: 'text', value: formatEuro(payment.data.balance) },
      ]);

      /*details.push([
        'Payer',
        {
          type: 'resource',
          resourceType: 'payer',
          id: payment.data.payerId.value,
        },
      ]); TODO */

      if (isPaymentInvoice(payment.data)) {
        if (payment.data.data.date) {
          details.push([
            'Date',
            {
              type: 'text',
              value: format(parseISO(payment.data.data.date), 'dd.MM.yyyy'),
            },
          ]);
        }

        details.push([
          'Reference',
          { type: 'text', value: payment.data.data.reference_number },
        ]);
      }
    } else if (type === 'bank-statement') {
      const statement = statementsApi.endpoints.getBankStatement.select(id)(state);

      if (!statement.data) {
        return null;
      }

      name = statement.data.id;
      value = statement.data

      details.push([
        'Bank account',
        { type: 'text', value: statement.data.accountIban },
      ]);
      details.push([
        'Starting',
        { type: 'text', value: format(statement.data.openingBalance.date, 'dd.MM.yyyy') },
      ]);
      details.push([
        'Starting',
        { type: 'text', value: format(statement.data.closingBalance.date, 'dd.MM.yyyy') },
      ]);
      details.push([
        'Generated at',
        { type: 'text', value: format(statement.data.generatedAt, 'dd.MM.yyyy') },
      ]);
    } else {
      return null;
    }

    return {
      id,
      type,
      name,
      details,
      value,
    };
  },
);

export const useFetchResourceDetails = (
  type: string,
  id: string,
  skip = false,
) => {
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (skip) {
      return;
    }

    if (type === 'debt') {
      dispatch(debtApi.endpoints.getDebt.initiate(id));
    } else if (type === 'payer') {
      dispatch(payersApi.endpoints.getPayer.initiate(id));
    } else if (type === 'center') {
      dispatch(debtCentersApi.endpoints.getDebtCenter.initiate(id));
    } else if (type === 'payment') {
      dispatch(paymentsApi.endpoints.getPayment.initiate(id));
    } else if (type === 'bank-statement') {
      dispatch(statementsApi.endpoints.getBankStatement.initiate(id));
    }
  }, [type, id, skip]);

  const result = useAppSelector(state =>
    selectResourceDetails(state, type, id),
  );

  return result;
};
