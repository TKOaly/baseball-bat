import { differenceInDays, format, isPast } from 'date-fns';
import { AlertCircle, AlertTriangle, CheckCircle, Loader } from 'react-feather';
import { useTranslation } from 'react-i18next';
import { formatEuro, euro, sumEuroValues } from '@bbat/common/src/currency';

import { useGetDebtQuery } from '../api/debt';
import { useGetPaymentsByDebtQuery } from '../api/payments';
import { RouteComponentProps } from 'wouter';
import { isPaymentInvoice } from '@bbat/common/src/types';

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

type Props = RouteComponentProps<{
  id: string;
}>;

export const DebtDetails = ({ params }: Props) => {
  const { t } = useTranslation([], { keyPrefix: 'paymentDetails' });
  const { data: debt, isLoading } = useGetDebtQuery(params.id);
  const { data: payments, isLoading: paymentsAreLoading } =
    useGetPaymentsByDebtQuery(params.id);

  if (!debt || !payments || isLoading || paymentsAreLoading) {
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
          <h3 className="text-xl font-bold text-gray-500">Debt: {debt.name}</h3>
          <div>
            <span>{t('amountLabel')}:</span> {formatEuro(total)}
          </div>
          {debt.dueDate && (
            <div>
              <span>{t('dueDateLabel')}:</span>{' '}
              {format(debt.dueDate, 'yyyy.MM.dd')}
            </div>
          )}
          <p>{debt.description}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {isUnpaid && (
            <span className="line-height-10 flex items-center rounded-full bg-blue-500 py-1 pl-1 pr-2.5 text-white">
              <Loader className="ml-0.5 mr-1 h-5 w-5" />
              {t('unpaidBadge')}
            </span>
          )}
          {isMispaid && (
            <span className="line-height-10 flex items-center rounded-full bg-yellow-300 py-1 pl-2 pr-2.5 text-black">
              <AlertTriangle className="ml-0.5 mr-1.5 h-5 w-5" />
              {t('mispaidBadge')}
            </span>
          )}
          {isPaid && (
            <span className="line-height-10 flex items-center rounded-full bg-green-500 py-1 pl-1 pr-2.5 text-white">
              <CheckCircle className="ml-0.5 mr-1.5 h-5 w-5" />
              {t('paidBadge')}
            </span>
          )}
          {isLate && (
            <span className="line-height-10 flex items-center rounded-full bg-red-500 py-1 pl-1 pr-2.5 text-white">
              <AlertCircle className="ml-0.5 mr-1 h-5 w-5" />
              {t('lateBadge')}
            </span>
          )}
        </div>
      </div>

      {defaultPayment && (
        <>
          <h4 className="mb-2 mt-5 font-bold text-gray-500">
            {t('invoiceDetailsHeader')}
          </h4>
          <div className="rounded border bg-gray-50 p-3 shadow">
            <table>
              <tr>
                <th className="pr-3 text-right">{t('invoiceTitleHeader')}</th>
                <td>{debt.name}</td>
              </tr>
              <tr>
                <th className="pr-3 text-right">{t('invoiceNumberHeader')}</th>
                <td>{defaultPayment.paymentNumber}</td>
              </tr>
              <tr>
                <th className="pr-3 text-right">
                  {t('invoiceCreatedAtHeader')}
                </th>
                <td>{formatDate(defaultPayment.createdAt)}</td>
              </tr>
              <tr>
                <th className="pr-3 text-right">{t('invoiceDueDateHeader')}</th>
                <td>
                  {debt.dueDate && formatDate(new Date(debt.dueDate))} (
                  {debt.dueDate && formatDateRelative(debt.dueDate)})
                </td>
              </tr>
              <tr>
                <th className="pr-3 text-right">{t('invoiceAmountHeader')}</th>
                <td>{formatEuro(total)}</td>
              </tr>
              {isPaymentInvoice(defaultPayment) && (
                <tr>
                  <th className="h-4 pr-3 text-right">
                    {t('invoiceReferenceNumberHeader')}
                  </th>
                  <td>{defaultPayment.data.reference_number}</td>
                </tr>
              )}
              <tr>
                <th className="pr-3 text-right">
                  {t('invoiceBeneficaryNameHeader')}
                </th>
                <td>TKO-äly ry</td>
              </tr>
              <tr>
                <th className="pr-3 text-right">
                  {t('invoiceBeneficaryAccountHeader')}
                </th>
                <td>FI89 7997 7995 1312 86</td>
              </tr>
              <tr>
                <th className="pr-3 text-right">{t('invoiceBICHeader')}</th>
                <td>HOLVFIHH</td>
              </tr>
            </table>
          </div>
        </>
      )}
    </div>
  );
};
