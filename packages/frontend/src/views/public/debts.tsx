import { euro, formatEuro, sumEuroValues } from '@bbat/common/src/currency';
import { useGetPayerDebtsQuery, useGetPayerQuery } from '../../api/payers';
import { formatDate } from 'date-fns/format';
import { Link, useLocation } from 'wouter';
import { cva } from 'class-variance-authority';
import { Debt, Payment } from '@bbat/common/src/types';
import { ArrowRight, Info } from 'react-feather';
import { Trans, useTranslation } from 'react-i18next';
import { useAppDispatch } from '../../store';
import paymentPoolSlice from '../../state/payment-pool';
import { Button } from '@bbat/ui/src/button';
import { useGetOwnPaymentsQuery } from '../../api/payments';
import { useGetInfoQuery } from '../../api/banking/statements';
import { useMemo } from 'react';
import { DebtStatusBadge } from '../../components/debt-status-badge';

const debtCardCva = cva(
  'rounded-md border shadow-md shadow-black/5 bg-white/60',
  {
    variants: {
      selected: {
        true: 'outline outline-2 outline-yellow-400',
        false: '',
      },
    },
  },
);

type CardProps = {
  debt: Debt;
};

const DebtCard: React.FC<CardProps> = ({ debt }) => {
  const { t } = useTranslation([], { keyPrefix: 'debtCard' });

  return (
    <div className={debtCardCva({ selected: false })}>
      <div className="flex grow p-4">
        <div className="grow">
          <h3 className="font-bold">{debt.name}</h3>
          <div className="flex flex-col gap-x-10 sm:flex-row">
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
                <div>{formatDate(debt.date, 'dd.MM.yyyy')}</div>
              </div>
            )}
            {debt.dueDate && (
              <div>
                <div className="mt-2 text-sm text-zinc-500">
                  {t('dueDateLabel')}
                </div>
                <div>{formatDate(debt.dueDate, 'dd.MM.yyyy')}</div>
              </div>
            )}
          </div>
        </div>
        <div>
          <DebtStatusBadge debt={debt} />
        </div>
      </div>
      <div className="flex gap-4 border-t p-3">
        <Link
          to={`/debts/${debt.id}/pay`}
          className="rounded-sm px-2 py-1 text-sm font-bold uppercase text-yellow-500 hover:bg-zinc-50"
        >
          {t('payButton')}
        </Link>
        <Link
          to={`/debts/${debt.id}`}
          className="px-2 py-1 text-sm font-bold uppercase text-zinc-400 hover:bg-zinc-50"
        >
          {t('detailsButton')}
        </Link>
      </div>
    </div>
  );
};

type PaymentCardProps = {
  payment: Payment;
};

const PaymentCard: React.FC<PaymentCardProps> = ({ payment }) => {
  const { t } = useTranslation([], { keyPrefix: 'paymentCard' });

  return (
    <div className={debtCardCva({ selected: false })}>
      <div className="flex grow p-4">
        <div className="grow">
          <h3 className="font-bold">{payment.title}</h3>
          <div className="flex flex-col gap-x-10 sm:flex-row">
            <div>
              <div className="mt-2 text-sm text-zinc-500">{t('typeLabel')}</div>
              <div className="">{t(`paymentType.${payment.type}`)}</div>
            </div>
            <div>
              <div className="mt-2 text-sm text-zinc-500">
                {t('amountLabel')}
              </div>
              <div className="">{formatEuro(payment.initialAmount)}</div>
            </div>
            {payment.createdAt && (
              <div>
                <div className="mt-2 text-sm text-zinc-500">
                  {t('dateLabel')}
                </div>
                <div>{formatDate(payment.createdAt, 'dd.MM.yyyy')}</div>
              </div>
            )}
            {payment.paidAt && (
              <div>
                <div className="mt-2 text-sm text-zinc-500">
                  {t('paidLabel')}
                </div>
                <div>{formatDate(payment.paidAt, 'dd.MM.yyyy')}</div>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="flex gap-4 border-t p-3">
        <Link
          to={`/payments/${payment.id}`}
          className="rounded-sm px-2 py-1 text-sm font-bold uppercase text-gray-500 hover:bg-zinc-50"
        >
          {t('detailsButton')}
        </Link>
      </div>
    </div>
  );
};

export const Debts = () => {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const { data: bankInfo } = useGetInfoQuery();
  const { data: debtsResult } = useGetPayerDebtsQuery({ id: 'me' });
  const { data: payments } = useGetOwnPaymentsQuery();
  const { data: profile } = useGetPayerQuery('me');

  const debts = debtsResult?.result;

  const dispatch = useAppDispatch();

  const handlePayAll = async () => {
    dispatch(
      paymentPoolSlice.actions.setSelectedPayments(unpaidDebts.map(p => p.id)),
    );
    navigate('/payment/new');
  };

  const unpaidDebts = useMemo(
    () =>
      (debts ? [...debts] : [])
        .sort(
          (a, b) =>
            (b.publishedAt?.valueOf() ?? 0) - (a.publishedAt?.valueOf() ?? 0),
        )
        .filter(p => p.status === 'unpaid' && !p.credited),
    [debts],
  );

  const paidPayments = useMemo(
    () =>
      (payments ? [...payments] : [])
        .sort((a, b) => (b.paidAt?.valueOf() ?? 0) - (a.paidAt?.valueOf() ?? 0))
        .filter(p => p.status === 'paid' && !p.credited),
    [payments],
  );

  const totalEuros = unpaidDebts
    .flatMap(debt => debt.debtComponents.map(dc => dc.amount))
    .reduce(sumEuroValues, euro(0));

  return (
    <div className="space-y-10">
      <div className="rounded-md bg-white/90 p-8 shadow-xl">
        <h3 className="text-xl font-bold text-zinc-800">
          {t('welcomeHeader', { name: profile?.name })}
        </h3>
        <p className="mb-7 mt-5">
          {unpaidDebts.length > 0 && (
            <Trans
              i18nKey="welcomeSummary"
              values={{
                total: formatEuro(totalEuros),
                number: unpaidDebts.length,
              }}
              components={{
                bold: <span className="font-bold" />,
              }}
            >
              {`You have <bold>{{ number }}</bold>
              unpaid debts, which have a combined value of
              <bold>{{ total }}</bold>.`}
            </Trans>
          )}
          {unpaidDebts.length === 0 && t('welcomeSummaryNoDebts')}
        </p>

        {unpaidDebts.length > 0 && (
          <Button
            onClick={handlePayAll}
            className="h-10 bg-yellow-400 px-5 text-black/80 hover:bg-yellow-500"
          >
            {t('payAllButton')} <ArrowRight className="size-5" />
          </Button>
        )}
      </div>

      {unpaidDebts?.length > 0 && (
        <div className="rounded-md bg-white/90 p-8 shadow-xl">
          <h3 className="mb-5 font-bold text-zinc-800">
            {t('unpaidDebtsHeader')}
          </h3>
          <p className="mb-8 text-zinc-900">
            {t('unpaidDebtsDisclaimer', {
              latestBankInfo: bankInfo?.latestBankInfo,
            })}
          </p>
          <div className="space-y-6">
            {(unpaidDebts ?? []).map(debt => (
              <DebtCard key={debt.id} debt={debt} />
            ))}
          </div>
          {unpaidDebts.length === 0 && (
            <div className="mt-3 flex items-center gap-3 rounded-md border border-gray-300 bg-gray-100 px-3 py-3 text-gray-600 shadow">
              <Info />
              {t('noUnpaidDebts')}
            </div>
          )}
        </div>
      )}

      <div className="rounded-md bg-white/90 p-8 shadow-xl">
        <h3 className="mb-8 font-bold text-zinc-800">
          {t('closedPaymentsHeader')}
        </h3>
        <div className="space-y-6">
          {(paidPayments ?? []).map(payment => (
            <PaymentCard key={payment.id} payment={payment} />
          ))}
        </div>
      </div>
    </div>
  );
};
