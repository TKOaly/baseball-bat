import { useTranslation } from 'react-i18next';
import { formatEuro } from '@bbat/common/src/currency';

import { useGetDebtQuery } from '../../api/debt';
import { useGetPaymentsByDebtQuery } from '../../api/payments';
import { RouteComponentProps } from 'wouter';
import { isPaymentInvoice } from '@bbat/common/src/types';
import { DebtStatusBadge } from '../../components/debt-status-badge';
import { Loader } from 'react-feather';
import { useMemo } from 'react';

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
  const { data: paymentsData, isLoading: paymentsAreLoading } =
    useGetPaymentsByDebtQuery({ debtId: params.id });

  const payments = useMemo(() => paymentsData?.result ?? [], [paymentsData]);

  if (!debt || !payments || isLoading || paymentsAreLoading) {
    return (
      <div className="flex justify-center">
        <Loader className="size-20 animate-[spin_3s_linear] text-yellow-500 drop-shadow-lg" />
        ;
      </div>
    );
  }

  const defaultPayment = (payments || []).find(
    payment => payment.type === 'invoice',
  );

  return (
    <div>
      <div className="rounded-md bg-white/90 p-8 shadow-xl">
        <h3 className="mb-8 font-bold text-zinc-800">
          <span className="mb-2 mr-3 inline-block">{debt.name}</span>
          <DebtStatusBadge debt={debt} />
        </h3>
        <div className="grid w-full grid-cols-1 gap-5 gap-y-3 sm:grid-cols-2 sm:gap-y-5 md:grid-cols-3">
          <div>
            <div className="text-sm text-zinc-500">{t('amountLabel')}</div>
            <div className="">{formatEuro(debt.total)}</div>
          </div>
          {debt.date && (
            <div>
              <div className="text-sm text-zinc-500">{t('dateLabel')}</div>
              <div>{formatDate(debt.date)}</div>
            </div>
          )}
          {debt.dueDate && (
            <div>
              <div className="text-sm text-zinc-500">{t('dueDateLabel')}</div>
              <div>{formatDate(debt.dueDate)}</div>
            </div>
          )}
          {debt.description && (
            <div className="col-span-full">
              <div className="text-sm text-zinc-500">
                {t('paymentMessageLabel')}
              </div>
              <p className="whitespace-pre rounded-sm bg-zinc-50 px-4 py-3 font-mono text-sm shadow-md">
                {debt.description}
              </p>
            </div>
          )}
        </div>
      </div>

      {defaultPayment && (
        <div className="mt-10 rounded-md bg-white/90 p-8 shadow-xl">
          <h4 className="mb-8 font-bold text-zinc-800">
            {t('invoiceDetailsHeader')}
          </h4>
          <div className="grid grid-cols-1 gap-5 gap-y-3 sm:grid-cols-2 sm:gap-y-5 md:grid-cols-3">
            <div>
              <div className="text-sm text-zinc-500">
                {t('invoiceTitleHeader')}
              </div>
              <div className="">{defaultPayment.title}</div>
            </div>
            <div>
              <div className="text-sm text-zinc-500">
                {t('invoiceNumberHeader')}
              </div>
              <div className="">{defaultPayment.paymentNumber}</div>
            </div>
            {isPaymentInvoice(defaultPayment) && (
              <>
                <div>
                  <div className="text-sm text-zinc-500">
                    {t('invoiceCreatedAtHeader')}
                  </div>
                  <div className="">
                    {formatDate(defaultPayment.data?.date)}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-zinc-500">
                    {t('invoiceDueDateHeader')}
                  </div>
                  <div className="">
                    {formatDate(defaultPayment.data?.due_date)}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-zinc-500">
                    {t('invoiceReferenceNumberHeader')}
                  </div>
                  <div className="">
                    {defaultPayment.data?.reference_number?.replace(
                      /.{4}/g,
                      '$& ',
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-zinc-500">
                    {t('invoiceBeneficaryNameHeader')}
                  </div>
                  <div className="">TKO-äly ry</div>
                </div>
                <div>
                  <div className="text-sm text-zinc-500">
                    {t('invoiceBeneficaryAccountHeader')}
                  </div>
                  <div className="">FI89 7997 7995 1312 86</div>
                </div>
              </>
            )}
            <div>
              <div className="text-sm text-zinc-500">
                {t('invoiceAmountHeader')}
              </div>
              <div className="">{formatEuro(defaultPayment.balance)}</div>
            </div>
            <div>
              <div className="text-sm text-zinc-500">{t('statusLabel')}</div>
              <div className="">
                {t(`paymentStatus.${defaultPayment.status}`)}
              </div>
            </div>
            {defaultPayment.message && (
              <div className="col-span-full">
                <div className="text-sm text-zinc-500">
                  {t('paymentMessageLabel')}
                </div>
                <p className="overflow-auto whitespace-pre rounded bg-zinc-50 px-4 py-3 font-mono text-sm shadow-md">
                  {defaultPayment.message}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
