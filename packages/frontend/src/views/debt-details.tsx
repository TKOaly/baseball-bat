import { differenceInDays, format, isPast } from 'date-fns';
import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle, Loader } from 'react-feather';
import { useTranslation } from 'react-i18next';
import { formatEuro, euro, sumEuroValues } from '@bbat/common/src/currency';

import { useGetDebtQuery } from '../api/debt';
import { useGetPaymentsByDebtQuery } from '../api/payments';

const formatDate = (date: Date | string) => {
  const parsed = typeof date === 'string' ? new Date(date) : date;

  return new Intl.DateTimeFormat([], { dateStyle: 'medium' }).format(parsed);
};

const formatDateRelative = (date: Date | string) => {
  const parsed = typeof date === 'string' ? new Date(date) : date;

  return new Intl.RelativeTimeFormat([], { style: 'long' }).format(
    differenceInDays(parsed, new Date()),
    'day',
  );
};

export const DebtDetails = ({ params }) => {
  const { t } = useTranslation([], { keyPrefix: 'paymentDetails' });
  const { data: debt, isLoading } = useGetDebtQuery(params.id);
  const { data: payments, isLoading: paymentsAreLoading } =
    useGetPaymentsByDebtQuery(params.id);

  if (isLoading || paymentsAreLoading) {
    return <div>Loading...</div>;
  }

  const total = debt.debtComponents
    .map(dc => dc.amount)
    .reduce(sumEuroValues, euro(0));

  const defaultPayment = (payments || []).find(
    payment => payment.type === 'invoice',
  );

  const isLate = debt?.dueDate && isPast(new Date(debt.dueDate));
  const isUnpaid = debt?.status === 'unpaid';
  const isMispaid = debt?.status === 'mispaid';
  const isPaid = debt?.status === 'paid';

  return (
    <div>
      <div className="flex">
        <div className="flex-grow">
          <h3 className="text-xl text-gray-500 font-bold">Debt: {debt.name}</h3>
          <div>
            <span>{t('amountLabel')}:</span> {formatEuro(total)}
          </div>
          <div>
            <span>{t('dueDateLabel')}:</span>{' '}
            {format(new Date(debt.dueDate), 'yyyy.MM.dd')}
          </div>
          <p>{debt.description}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {isUnpaid && (
            <span className="rounded-full bg-blue-500 text-white flex items-center line-height-10 pl-1 pr-2.5 py-1">
              <Loader className="h-5 w-5 ml-0.5 mr-1" />
              {t('unpaidBadge')}
            </span>
          )}
          {isMispaid && (
            <span className="rounded-full bg-yellow-300 text-black flex items-center line-height-10 pl-2 pr-2.5 py-1">
              <AlertTriangle className="h-5 w-5 ml-0.5 mr-1.5" />
              {t('mispaidBadge')}
            </span>
          )}
          {isPaid && (
            <span className="rounded-full bg-green-500 text-white flex items-center line-height-10 pl-1 pr-2.5 py-1">
              <CheckCircle className="h-5 w-5 ml-0.5 mr-1.5" />
              {t('paidBadge')}
            </span>
          )}
          {isLate && (
            <span className="rounded-full bg-red-500 text-white flex items-center line-height-10 pl-1 pr-2.5 py-1">
              <AlertCircle className="h-5 w-5 ml-0.5 mr-1" />
              {t('lateBadge')}
            </span>
          )}
        </div>
      </div>

      {defaultPayment && (
        <>
          <h4 className="text-gray-500 mt-5 mb-2 font-bold">
            {t('invoiceDetailsHeader')}
          </h4>
          <div className="rounded shadow border p-3 bg-gray-50">
            <table>
              <tr>
                <th className="text-right pr-3">{t('invoiceTitleHeader')}</th>
                <td>{debt.name}</td>
              </tr>
              <tr>
                <th className="text-right pr-3">{t('invoiceNumberHeader')}</th>
                <td>{defaultPayment.payment_number}</td>
              </tr>
              <tr>
                <th className="text-right pr-3">
                  {t('invoiceCreatedAtHeader')}
                </th>
                <td>{formatDate(defaultPayment.created_at)}</td>
              </tr>
              <tr>
                <th className="text-right pr-3">{t('invoiceDueDateHeader')}</th>
                <td>
                  {debt.dueDate && formatDate(new Date(debt.dueDate))} (
                  {debt.dueDate && formatDateRelative(debt.dueDate)})
                </td>
              </tr>
              <tr>
                <th className="text-right pr-3">{t('invoiceAmountHeader')}</th>
                <td>{formatEuro(total)}</td>
              </tr>
              <tr>
                <th className="text-right pr-3 h-4">
                  {t('invoiceReferenceNumberHeader')}
                </th>
                <td>{defaultPayment.data?.reference_number}</td>
              </tr>
              <tr>
                <th className="text-right pr-3">
                  {t('invoiceBeneficaryNameHeader')}
                </th>
                <td>TKO-äly ry</td>
              </tr>
              <tr>
                <th className="text-right pr-3">
                  {t('invoiceBeneficaryAccountHeader')}
                </th>
                <td>FI89 7997 7995 1312 86</td>
              </tr>
              <tr>
                <th className="text-right pr-3">{t('invoiceBICHeader')}</th>
                <td>HOLVFIHH</td>
              </tr>
            </table>
          </div>
        </>
      )}
    </div>
  );
};
