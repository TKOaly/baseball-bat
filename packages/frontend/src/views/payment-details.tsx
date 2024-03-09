import { useTranslation } from 'react-i18next';
import { Timeline } from '@bbat/ui/timeline';
import { useGetPaymentQuery } from '../api/payments';
import { useGetDebtsByPaymentQuery } from '../api/debt';
import { formatEuro, euro, sumEuroValues } from '@bbat/common/src/currency';
import { isPaymentInvoice, Payment } from '@bbat/common/src/types';
import { differenceInDays } from 'date-fns/differenceInDays';
import { RouteComponentProps } from 'wouter';

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
          <th className="pr-3 text-right">{t('invoiceTitleHeader')}</th>
          <td>{payment.title}</td>
        </tr>
        <tr>
          <th className="pr-3 text-right">{t('invoiceNumberHeader')}</th>
          <td>{payment.paymentNumber}</td>
        </tr>
        <tr>
          <th className="pr-3 text-right">{t('invoiceCreatedAtHeader')}</th>
          <td>{formatDate(payment.createdAt)}</td>
        </tr>
        <tr>
          <th className="pr-3 text-right">{t('invoiceDueDateHeader')}</th>
          <td>
            {formatDate(new Date(payment.data.due_date))} (
            {formatDateRelative(payment.data.due_date)})
          </td>
        </tr>
        <tr>
          <th className="pr-3 text-right">{t('invoiceAmountHeader')}</th>
          <td>{formatEuro(payment.balance)}</td>
        </tr>
        <tr>
          <th className="h-4 pr-3 text-right">
            {t('invoiceReferenceNumberHeader')}
          </th>
          <td>{payment.data.reference_number}</td>
        </tr>
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
  );
};

type Props = RouteComponentProps<{ id: string }>;

export const PaymentDetails = ({ params }: Props) => {
  const id = params.id;
  const { t } = useTranslation();
  const { data: payment, isLoading } = useGetPaymentQuery(id);
  const { data: debts, isLoading: debtsAreLoading } = useGetDebtsByPaymentQuery(
    id,
    { skip: !payment },
  );

  if (isLoading || !payment || !debts) {
    return <span>Loading...</span>;
  }

  return (
    <>
      <h3 className="text-xl font-bold text-gray-500">
        Payment: {payment.title} ({payment.paymentNumber})
      </h3>

      <div className="my-3">
        <table>
          <tr>
            <th className="pr-3 text-left">{t('createdAt')}</th>
            <td>{formatDate(payment.createdAt)}</td>
          </tr>
          <tr>
            <th className="pr-3 text-left">{t('toBePaid')}</th>
            <td>{formatEuro(payment.balance)}</td>
          </tr>
          <tr>
            <th className="pr-3 text-left">{t('paymentMethod')}</th>
            <td>{payment.type}</td>
          </tr>
        </table>
      </div>

      <h3 className="mt-5 border-b-2 pb-1 text-xl font-bold text-gray-600">
        {t('paymentMessage')}
      </h3>

      <p className="whitespace-pre p-3">{payment.message}</p>

      <h3 className="mt-5 border-b-2 pb-1 text-xl font-bold text-gray-600">
        {t('paymentSummary')}
      </h3>

      <ul className="p-3">
        {debtsAreLoading && 'Loading...'}
        {(debts ?? []).map(debt => (
          <li className="mb-2 tabular-nums" key={debt.id}>
            <h4 className="flex font-bold">
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
          <h4 className="flex font-bold">
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

      <h3 className="mt-5 border-b-2 pb-1 text-xl font-bold text-gray-600">
        {t('paymentDetailsHeader')}
      </h3>

      {payment.type === 'invoice' && <InvoiceDetails payment={payment} />}

      <h3 className="mt-5 border-b-2 pb-1 text-xl font-bold text-gray-600">
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
