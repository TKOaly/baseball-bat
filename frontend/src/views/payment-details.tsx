import React from 'react';
import { useTranslation } from 'react-i18next';
import { Timeline } from '../components/timeline';
import { useGetPaymentQuery } from '../api/payments';
import { useGetDebtsByPaymentQuery } from '../api/debt';
import { formatEuro, euro, sumEuroValues } from '@bbat/common/'currency';
import { isPaymentInvoice, Payment } from '@bbat/common/'types';
import { differenceInDays } from 'date-fns';

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

const InvoiceDetails = ({ payment }: { payment: Payment }) => {
  const { t } = useTranslation([], { keyPrefix: 'paymentDetails' });

  if (!isPaymentInvoice(payment)) {
    return null;
  }

  return (
    <div className="p-3">
      <table>
        <tr>
          <th className="text-right pr-3">{t('invoiceTitleHeader')}</th>
          <td>{payment.title}</td>
        </tr>
        <tr>
          <th className="text-right pr-3">{t('invoiceNumberHeader')}</th>
          <td>{payment.paymentNumber}</td>
        </tr>
        <tr>
          <th className="text-right pr-3">{t('invoiceCreatedAtHeader')}</th>
          <td>{formatDate(payment.createdAt)}</td>
        </tr>
        <tr>
          <th className="text-right pr-3">{t('invoiceDueDateHeader')}</th>
          <td>
            {formatDate(new Date(payment.data.due_date))} (
            {formatDateRelative(payment.data.due_date)})
          </td>
        </tr>
        <tr>
          <th className="text-right pr-3">{t('invoiceAmountHeader')}</th>
          <td>{formatEuro(payment.balance)}</td>
        </tr>
        <tr>
          <th className="text-right pr-3 h-4">
            {t('invoiceReferenceNumberHeader')}
          </th>
          <td>{payment.data.reference_number}</td>
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
  );
};

export const PaymentDetails = ({ params }) => {
  const id = params.id;
  const { t } = useTranslation();
  const { data: payment, isLoading } = useGetPaymentQuery(id);
  const { data: debts, isLoading: debtsAreLoading } = useGetDebtsByPaymentQuery(
    id,
    { skip: !payment },
  );

  if (isLoading) {
    return <span>Loading...</span>;
  }

  return (
    <>
      <h3 className="text-xl text-gray-500 font-bold">
        Payment: {payment.title} ({payment.paymentNumber})
      </h3>

      <div className="my-3">
        <table>
          <tr>
            <th className="text-left pr-3">{t('createdAt')}</th>
            <td>{formatDate(payment.createdAt)}</td>
          </tr>
          <tr>
            <th className="text-left pr-3">{t('toBePaid')}</th>
            <td>{formatEuro(payment.balance)}</td>
          </tr>
          <tr>
            <th className="text-left pr-3">{t('paymentMethod')}</th>
            <td>{payment.type}</td>
          </tr>
        </table>
      </div>

      <h3 className="border-b-2 text-xl font-bold pb-1 mt-5 text-gray-600">
        {t('paymentMessage')}
      </h3>

      <p className="whitespace-pre p-3">{payment.message}</p>

      <h3 className="border-b-2 text-xl font-bold pb-1 mt-5 text-gray-600">
        {t('paymentSummary')}
      </h3>

      <ul className="p-3">
        {debtsAreLoading && 'Loading...'}
        {(debts ?? []).map(debt => (
          <li className="mb-2 tabular-nums" key={debt.id}>
            <h4 className="font-bold flex">
              <span className="flex-grow">{debt.name}</span>
              <span>
                {formatEuro(
                  debt.debtComponents
                    .map(dc => dc.amount)
                    .reduce(sumEuroValues, euro(0)),
                )}
              </span>
            </h4>
            <div className="pl-3">
              <p>{debt.description}</p>
              <ul>
                {debt.debtComponents.map(dc => (
                  <li className="flex" key={dc.id}>
                    <span className="flex-grow">{dc.name}</span>
                    <span>{formatEuro(dc.amount)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </li>
        ))}
        <li>
          <h4 className="font-bold flex">
            <span className="flex-grow">{t('total')}</span>
            <span>
              {formatEuro(
                (debts ?? [])
                  .flatMap(d => d.debtComponents)
                  .map(dc => dc.amount)
                  .reduce(sumEuroValues, euro(0)),
              )}
            </span>
          </h4>
        </li>
      </ul>

      <h3 className="border-b-2 text-xl font-bold pb-1 mt-5 text-gray-600">
        {t('paymentDetailsHeader')}
      </h3>

      {payment.type === 'invoice' && <InvoiceDetails payment={payment} />}

      <h3 className="border-b-2 text-xl font-bold pb-1 mt-5 text-gray-600">
        {t('paymentEventTimeline')}
      </h3>

      <Timeline
        events={[
          {
            time: new Date(payment.createdAt),
            title: t('paymentCreated'),
          },
        ]}
      />
    </>
  );
};
