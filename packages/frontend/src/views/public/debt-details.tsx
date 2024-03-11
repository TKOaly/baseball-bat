import { isPast } from 'date-fns/isPast';
import { AlertCircle, AlertTriangle, CheckCircle, Loader } from 'react-feather';
import { useTranslation } from 'react-i18next';
import { formatEuro } from '@bbat/common/src/currency';

import { useGetDebtQuery } from '../../api/debt';
import { useGetPaymentsByDebtQuery } from '../../api/payments';
import { RouteComponentProps } from 'wouter';
import { isPaymentInvoice } from '@bbat/common/src/types';

const formatDate = (date: Date | string) => {
  const parsed = typeof date === 'string' ? new Date(date) : date;

  return new Intl.DateTimeFormat([], { dateStyle: 'medium' }).format(parsed);
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

  const defaultPayment = (payments || []).find(
    payment => payment.type === 'invoice',
  );

  const isLate = debt?.dueDate && isPast(new Date(debt.dueDate));
  const isUnpaid = debt?.status === 'unpaid';
  const isMispaid = debt?.status === 'mispaid';
  const isPaid = debt?.status === 'paid';

  return (
    <div>
      <div className="rounded-md bg-white/90 p-8 shadow-xl">
        <div className="flex">
          <div className="flex-grow">
            <h3 className="mb-8 font-bold text-zinc-800">{debt.name}</h3>
            <div className="grid w-full grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3">
              <div>
                <div className="mt-2 text-sm text-zinc-500">
                  {t('amountLabel')}
                </div>
                <div className="">{formatEuro(debt.total)}</div>
              </div>
              {debt.date && (
                <div>
                  <div className="mt-2 text-sm text-zinc-500">
                    {t('dateLabel')}
                  </div>
                  <div>{formatDate(debt.date)}</div>
                </div>
              )}
              {debt.dueDate && (
                <div>
                  <div className="mt-2 text-sm text-zinc-500">
                    {t('dueDateLabel')}
                  </div>
                  <div>{formatDate(debt.dueDate)}</div>
                </div>
              )}
              {debt.description && (
                <div className="col-span-full">
                  <div className="mt-2 text-sm text-zinc-500">
                    {t('paymentMessageLabel')}
                  </div>
                  <p className="mt-2 whitespace-pre rounded-sm bg-zinc-50 px-4 py-3 font-mono text-sm shadow-md">
                    {debt.description}
                  </p>
                </div>
              )}
            </div>
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
      </div>

      {defaultPayment && (
        <div className="mt-10 rounded-md bg-white/90 p-8 shadow-xl">
          <h4 className="mb-8 font-bold text-zinc-800">
            {t('invoiceDetailsHeader')}
          </h4>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3">
            <div>
              <div className="mt-2 text-sm text-zinc-500">
                {t('invoiceTitleHeader')}
              </div>
              <div className="">{defaultPayment.title}</div>
            </div>
            <div>
              <div className="mt-2 text-sm text-zinc-500">
                {t('invoiceNumberHeader')}
              </div>
              <div className="">{defaultPayment.paymentNumber}</div>
            </div>
            {isPaymentInvoice(defaultPayment) && (
              <>
                <div>
                  <div className="mt-2 text-sm text-zinc-500">
                    {t('invoiceCreatedAtHeader')}
                  </div>
                  <div className="">
                    {formatDate(defaultPayment.data?.date)}
                  </div>
                </div>
                <div>
                  <div className="mt-2 text-sm text-zinc-500">
                    {t('invoiceDueDateHeader')}
                  </div>
                  <div className="">
                    {formatDate(defaultPayment.data?.due_date)}
                  </div>
                </div>
                <div>
                  <div className="mt-2 text-sm text-zinc-500">
                    {t('invoiceReferenceNumberHeader')}
                  </div>
                  <div className="">
                    {defaultPayment.data?.reference_number}
                  </div>
                </div>
                <div>
                  <div className="mt-2 text-sm text-zinc-500">
                    {t('invoiceBeneficaryNameHeader')}
                  </div>
                  <div className="">TKO-äly ry</div>
                </div>
                <div>
                  <div className="mt-2 text-sm text-zinc-500">
                    {t('invoiceBeneficaryAccountHeader')}
                  </div>
                  <div className="">FI89 7997 7995 1312 86</div>
                </div>
              </>
            )}
            <div>
              <div className="mt-2 text-sm text-zinc-500">
                {t('invoiceAmountHeader')}
              </div>
              <div className="">{formatEuro(defaultPayment.balance)}</div>
            </div>
            <div>
              <div className="mt-2 text-sm text-zinc-500">
                {t('statusLabel')}
              </div>
              <div className="">{defaultPayment.status}</div>
            </div>
            <div className="col-span-full">
              <div className="mt-2 text-sm text-zinc-500">
                {t('paymentMessageLabel')}
              </div>
              <p className="mt-2 whitespace-pre rounded-sm bg-zinc-50 px-4 py-3 font-mono text-sm shadow-md">
                {defaultPayment.message}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
