import React from 'react';
import { Circle, Info } from 'react-feather';
import { useLocation } from 'wouter';
import { Trans, useTranslation } from 'react-i18next';
import { Debt, euro, isPaymentInvoice } from '@bbat/common/src/types';
import paymentPoolSlice from '../state/payment-pool';
import { useGetPayerDebtsQuery, useGetPayerQuery } from '../api/payers';
import {
  cents,
  EuroValue,
  formatEuro,
  sumEuroValues,
} from '@bbat/common/src/currency';
import { format, isPast, parseISO } from 'date-fns';
import { Button } from '@bbat/ui/button';
import { useAppDispatch, useAppSelector } from '../store';
import { useGetOwnPaymentsQuery } from '../api/payments';

const FilledDisc = ({ color = 'currentColor', size = 24, ...rest }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...rest}
  >
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="3" fill="currentColor" />
  </svg>
);

type CardProps = {
  selectable?: boolean;
  onChangeSelected?: (selected: boolean) => void;
  selected?: boolean;
  title: string;
  subtitle: string;
  amount: EuroValue;
  actions: React.ReactNode;
  status?: { className: string; label: string } | null;
};

const Card: React.FC<CardProps> = ({
  selectable,
  onChangeSelected,
  selected,
  title,
  subtitle,
  amount,
  actions,
  status,
}) => {
  return (
    <div
      className="group mt-5 cursor-pointer rounded-md border border-gray-300 shadow-sm hover:border-blue-300"
      onClick={() => selectable && onChangeSelected?.(!selected)}
    >
      <div className="flex items-center p-4">
        {selectable &&
          (selected ? (
            <FilledDisc
              className="mr-4 text-blue-500 group-hover:text-blue-500"
              style={{ width: '1em', strokeWidth: '2.5px' }}
            />
          ) : (
            <Circle
              className="mr-4 text-gray-500 group-hover:text-blue-500"
              style={{ width: '1em', strokeWidth: '2.5px' }}
            />
          ))}
        <div>
          <h4 className="mb-0">{title}</h4>
          <div className="mr-2 text-sm text-gray-400">{subtitle}</div>
        </div>
        <div className="flex-grow" />
        {status && (
          <div
            className={`mx-2 rounded-sm px-1 py-0.5 text-xs font-bold ${status.className}`}
          >
            {status.label}
          </div>
        )}
        <span className="font-bold text-gray-600">{formatEuro(amount)}</span>
      </div>
      <div className="flex gap-1 border-t px-2.5 py-3">{actions}</div>
    </div>
  );
};

const CardAction: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({
  children,
  className,
  onClick,
  ...props
}) => (
  <button
    className={`rounded px-2 py-1.5 text-xs font-bold uppercase ${className}`}
    onClick={evt => {
      evt.stopPropagation();
      onClick?.(evt);
    }}
    {...props}
  >
    {children}
  </button>
);

type DebtCardProps = {
  debt: Debt;
};

const DebtCard: React.FC<DebtCardProps> = ({ debt }) => {
  const dispatch = useAppDispatch();
  const selectedDebts = useAppSelector(
    state => state.paymentPool.selectedPayments,
  );
  const selected = selectedDebts.indexOf(debt.id) > -1;
  const [, setLocation] = useLocation();
  const { t } = useTranslation();

  const handleToggleSelect = () => {
    dispatch(paymentPoolSlice.actions.togglePaymentSelection(debt.id));
  };

  const handlePay = () => {
    dispatch(paymentPoolSlice.actions.setSelectedPayments([debt.id]));
    setLocation('/payment/new');
  };

  return (
    <Card
      selectable
      onChangeSelected={handleToggleSelect}
      selected={selected}
      title={debt.name}
      subtitle={t('debtListInfoline', {
        dated: debt.publishedAt ? format(debt.publishedAt, 'dd.MM.yyyy') : '-',
        dueDate: debt.dueDate ? format(debt.dueDate, 'dd.MM.yyyy') : '-',
      })}
      amount={debt.debtComponents
        .map(c => c.amount)
        .reduce(sumEuroValues, euro(0))}
      status={
        debt.dueDate && isPast(new Date(debt.dueDate))
          ? { label: 'Myöhässä', className: 'bg-red-500 text-white' }
          : null
      }
      actions={
        <>
          <CardAction
            className="text-blue-500 hover:bg-gray-100"
            onClick={handlePay}
          >
            {t('pay')}
          </CardAction>
          <CardAction
            className="text-gray-600 hover:bg-gray-100"
            onClick={handleToggleSelect}
          >
            {!selected ? t('select') : t('unselect')}
          </CardAction>
          <CardAction
            className="text-gray-600 hover:bg-gray-100"
            onClick={() => setLocation(`/debt/${debt.id}`)}
          >
            {t('viewDetails')}
          </CardAction>
        </>
      }
    />
  );
};

export const Main = () => {
  const [, setLocation] = useLocation();
  const { t } = useTranslation();
  const { data: debtsResult } = useGetPayerDebtsQuery({ id: 'me' });
  const { data: payments } = useGetOwnPaymentsQuery();
  const { data: profile } = useGetPayerQuery('me');

  const debts = debtsResult?.result;

  const dispatch = useAppDispatch();

  const handlePayAll = async () => {
    dispatch(
      paymentPoolSlice.actions.setSelectedPayments(unpaidDepts.map(p => p.id)),
    );
    setLocation('/payment/new');
  };

  const unpaidDepts = (debts ?? []).filter(
    p => p.status === 'unpaid' && !p.credited,
  );
  const paidDepts = (debts ?? []).filter(
    p => p.status === 'paid' || p.credited,
  );

  const totalEuros = unpaidDepts
    .flatMap(debt => debt.debtComponents.map(dc => dc.amount))
    .reduce(sumEuroValues, euro(0));

  const openInvoices = (payments ?? []).filter(
    p => !p.credited && p.status !== 'paid' && isPaymentInvoice(p),
  );

  return (
    <>
      <h3 className="text-xl font-bold text-gray-500">
        {t('welcomeHeader', { name: profile?.name })}
      </h3>
      <p className="mt-3">
        {unpaidDepts.length > 0 && (
          <Trans
            i18nKey="welcomeSummary"
            values={{
              total: formatEuro(totalEuros),
              number: unpaidDepts.length,
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
        {unpaidDepts.length === 0 && t('welcomeSummaryNoDebts')}
      </p>

      {unpaidDepts.length > 0 && (
        <Button onClick={handlePayAll} className="mt-3">
          {t('payAllButton')}
        </Button>
      )}

      {/*<WelcomeDialog />*/}

      <h3 className="mt-5 border-b-2 pb-1 text-xl font-bold text-gray-600">
        {t('unpaidDebts')}
      </h3>

      {unpaidDepts.map(debt => (
        <DebtCard key={debt.id} debt={debt} />
      ))}

      {unpaidDepts.length === 0 && (
        <div className="mt-3 flex items-center gap-3 rounded-md border border-gray-300 bg-gray-100 px-3 py-3 text-gray-600 shadow">
          <Info />
          {t('noUnpaidDebts')}
        </div>
      )}

      <h3 className="mt-5 border-b-2 pb-1 text-xl font-bold text-gray-600">
        {t('openInvoices')}
      </h3>

      {openInvoices.map(p => (
        <Card
          key={p.id}
          title={p.title}
          subtitle={t('openInvoiceInfoline', {
            dated: isPaymentInvoice(p)
              ? format(parseISO(p.data.date), 'dd.MM.yyyy')
              : '-',
            due: isPaymentInvoice(p)
              ? format(new Date(p.data.due_date), 'dd.MM.yyyy')
              : '-',
          })}
          amount={cents(-p.balance)}
          actions={
            <>
              <CardAction
                className="text-gray-600 hover:bg-gray-100"
                onClick={() => setLocation(`/payment/${p.id}`)}
              >
                {t('viewDetails')}
              </CardAction>
            </>
          }
        />
      ))}

      {openInvoices.length === 0 && (
        <div className="mt-3 flex items-center gap-3 rounded-md border border-gray-300 bg-gray-100 px-3 py-3 text-gray-600 shadow">
          <Info />
          {t('noOpenInvoices')}
        </div>
      )}

      <h3 className="mt-5 border-b-2 pb-1 text-xl font-bold text-gray-600">
        {t('closedInvoices')}
      </h3>

      {(payments ?? []).flatMap(p => {
        if (
          !(
            (p.status === 'paid' || p.credited) &&
            p.type === 'invoice' &&
            isPaymentInvoice(p)
          )
        ) {
          return [];
        }

        return [
          <Card
            key={p.id}
            title={p.title}
            subtitle={
              p.status === 'paid'
                ? t('paidInvoiceInfoline', {
                    dated: format(new Date(p.data.date), 'dd.MM.yyyy'),
                  })
                : t('creditedInvoiceInfoline', {
                    dated: format(new Date(p.data.date), 'dd.MM.yyyy'),
                  })
            }
            amount={cents(-p.balance)}
            status={
              p.credited
                ? {
                    className: 'text-white bg-blue-500',
                    label: t('creditedStatus'),
                  }
                : {
                    className: 'text-white bg-green-500',
                    label: t('paidStatus'),
                  }
            }
            actions={
              <>
                <CardAction
                  className="text-gray-600 hover:bg-gray-100"
                  onClick={() => setLocation(`/payment/${p.id}`)}
                >
                  {t('viewDetails')}
                </CardAction>
              </>
            }
          />,
        ];
      })}

      {(payments ?? []).filter(
        p =>
          (p.status === 'paid' || p.credited) &&
          p.type === 'invoice' &&
          isPaymentInvoice(p),
      ).length === 0 && (
        <div className="mt-3 flex items-center gap-3 rounded-md border border-gray-300 bg-gray-100 px-3 py-3 text-gray-600 shadow">
          <Info />
          {t('noClosedInvoices')}
        </div>
      )}

      <h3 className="mt-5 border-b-2 pb-1 text-xl font-bold text-gray-600">
        {t('paidDebts')}
      </h3>

      {paidDepts.map(p => (
        <Card
          key={p.id}
          title={p.name}
          subtitle={t('paidDebtInfoline', {
            dated: p.date ? format(p.date, 'dd.MM.yyyy') : '-',
          })}
          amount={p.debtComponents
            .map(c => c.amount)
            .reduce(sumEuroValues, euro(0))}
          status={{
            className: 'text-white bg-green-500',
            label: t('paidStatus'),
          }}
          actions={[
            <CardAction
              key="viewDetails"
              className="text-gray-600 hover:bg-gray-100"
            >
              {t('viewDetails')}
            </CardAction>,
          ]}
        />
      ))}

      {paidDepts.length === 0 && (
        <div className="mt-3 flex items-center gap-3 rounded-md border border-gray-300 bg-gray-50 px-3 py-3 text-gray-600 shadow">
          <Info />
          {t('noPaidDebts')}
        </div>
      )}
    </>
  );
};
