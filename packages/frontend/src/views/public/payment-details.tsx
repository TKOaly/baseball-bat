import { useTranslation } from 'react-i18next';
import { Timeline, TimelineEvent } from '@bbat/ui/timeline';
import { useGetPaymentQuery } from '../../api/payments';
import { useGetDebtsByPaymentQuery } from '../../api/debt';
import { formatEuro } from '@bbat/common/src/currency';
import { isPaymentInvoice, PaymentEvent } from '@bbat/common/src/types';
import { RouteComponentProps } from 'wouter';

const formatDate = (date: Date | string) => {
  const parsed = typeof date === 'string' ? new Date(date) : date;

  return new Intl.DateTimeFormat([], { dateStyle: 'medium' }).format(parsed);
};

type Props = RouteComponentProps<{ id: string }>;

const createEventTimelineEntry = (
  event: PaymentEvent,
): TimelineEvent | undefined => {
  switch (event.type) {
    case 'created':
      return {
        time: event.time,
        title: 'Payment created',
      };

    case 'payment':
      return {
        time: event.time,
        title: `Payment of ${formatEuro(event.amount)} received`,
      };
  }
};

export const PaymentDetails = ({ params }: Props) => {
  const id = params.id;
  const { t } = useTranslation([], { keyPrefix: 'paymentDetails' });
  const { data: payment, isLoading } = useGetPaymentQuery(id);
  const { data: debts } = useGetDebtsByPaymentQuery(id, { skip: !payment });

  if (isLoading || !payment || !debts) {
    return <span>Loading...</span>;
  }

  return (
    <>
      <div className="rounded-md bg-white/90 p-8 shadow-xl">
        <h4 className="mb-8 font-bold text-zinc-800">
          {t('invoiceDetailsHeader')}
        </h4>
        <div className="grid grid-cols-1 gap-5 gap-y-3 sm:grid-cols-2 sm:gap-y-5 md:grid-cols-3">
          <div>
            <div className="text-sm text-zinc-500">
              {t('invoiceTitleHeader')}
            </div>
            <div className="">{payment.title}</div>
          </div>
          <div>
            <div className="text-sm text-zinc-500">
              {t('invoiceNumberHeader')}
            </div>
            <div className="">{payment.paymentNumber}</div>
          </div>
          <div>
            <div className="text-sm text-zinc-500">{t('paymentTypeLabel')}</div>
            <div className="">{t(`paymentType.${payment.type}`)}</div>
          </div>
          <div>
            <div className="text-sm text-zinc-500">
              {t('invoiceAmountHeader')}
            </div>
            <div className="">{formatEuro(payment.initialAmount)}</div>
          </div>
          {isPaymentInvoice(payment) && (
            <>
              <div>
                <div className="text-sm text-zinc-500">
                  {t('invoiceCreatedAtHeader')}
                </div>
                <div className="">{formatDate(payment.data.date)}</div>
              </div>
              <div>
                <div className="text-sm text-zinc-500">
                  {t('invoiceDueDateHeader')}
                </div>
                <div className="">{formatDate(payment.data.due_date)}</div>
              </div>
              <div>
                <div className="text-sm text-zinc-500">
                  {t('invoiceReferenceNumberHeader')}
                </div>
                <div className="">{payment.data.reference_number}</div>
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
              {t('paymentStatusLabel')}
            </div>
            <div className="">{t(`paymentStatus.${payment.status}`)}</div>
          </div>
          <div className="col-span-full">
            <div className="text-sm text-zinc-500">
              {t('paymentMessageLabel')}
            </div>
            <p className="overflow-auto whitespace-pre rounded-sm bg-zinc-50 px-4 py-3 font-mono text-sm shadow-md">
              {payment.message}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-10 rounded-md bg-white/90 p-8 shadow-xl">
        <h4 className="mb-8 font-bold text-zinc-800">{t('timelineHeader')}</h4>
        <Timeline
          events={payment.events
            .map(event => createEventTimelineEntry(event))
            .flatMap(d => (d ? [d] : []))}
        />
      </div>
    </>
  );
};
