import React from 'react';
import { useState } from 'react';
import { Circle, Info } from 'react-feather';
import { useLocation } from 'wouter';
import { Trans, useTranslation } from 'react-i18next';
import { Debt, euro, isPaymentInvoice } from '@bbat/common/src/types';
import { TextField } from '@bbat/ui/text-field';
import { Dialog } from '../components/dialog';
import paymentPoolSlice from '../state/payment-pool';
import {
  useGetPayerDebtsQuery,
  useGetPayerEmailsQuery,
  useGetPayerQuery,
  useUpdatePayerPreferencesMutation,
} from '../api/payers';
import {
  cents,
  EuroValue,
  formatEuro,
  sumEuroValues,
} from '@bbat/common/src/currency';
import { format, isPast, parseISO } from 'date-fns';
import { Button, SecondaryButton } from '@bbat/ui/button';
import { useGetUpstreamUserQuery } from '../api/upstream-users';
import { useAppDispatch, useAppSelector } from '../store';
import { useGetOwnPaymentsQuery } from '../api/payments';
import { skipToken } from '@reduxjs/toolkit/query';
import { BACKEND_URL } from '../config';

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

const WelcomeDialog = () => {
  const [stage, setStage] = useState(0);
  const [, setMembership] = useState<boolean | null>(null);
  const {
    data: user,
    isError: isUserError,
    isLoading: isUserLoading,
  } = useGetUpstreamUserQuery('me');
  const {
    data: profile,
    isError: isPayerError,
    isLoading: isPayerLoading,
  } = useGetPayerQuery('me');
  const { data: emails } = useGetPayerEmailsQuery(
    profile?.id?.value ?? skipToken,
  );
  const hasConfirmedMembership = useAppSelector(
    state => state.session.preferences?.hasConfirmedMembership,
  );
  const token = useAppSelector(state => state.session.token);
  const [updatePreferences] = useUpdatePayerPreferencesMutation();

  const open = !isUserLoading && !(user || hasConfirmedMembership);

  const handleMembershipConfirmation = (isMember: boolean) => {
    if (!isMember && profile) {
      updatePreferences({
        payerId: profile.id.value,
        preferences: {
          hasConfirmedMembership: true,
        },
      });

      return;
    }

    if (token) {
      window.location.replace(
        `${BACKEND_URL}/api/session/login?target=welcome&token=${encodeURIComponent(
          token,
        )}`,
      );
    }
  };

  return (
    <Dialog title="" open={open} noClose>
      {/*<div className="w-[25em] mx-auto my-5">
        <Stepper
          stages={['Welcome', 'Membership', 'Authentication', 'Name']}
          currentStage={stage}
          loading={false}
        />
      </div>*/}

      <h1 className="text-center mb-4 text-2xl text-gray-800">Welcome!</h1>

      <div className="w-80 mx-auto text-center">
        {stage === 0 && (
          <>
            <p className="mb-2">
              It seems that this is your first time using this service. Let{"'"}
              s get started by confirming a few basic things...
            </p>

            <p className="mb-5">
              You profile is not associated with a TKO-äly member account. If
              you are a member of the organization, you can authenticate with
              the button below. Otherwise you can skip this stage.
            </p>

            <div className="flex flex-col gap-2 mb-5">
              <Button onClick={() => handleMembershipConfirmation(true)}>
                I am a member of TKO-äly ry
              </Button>
              <SecondaryButton
                onClick={() => handleMembershipConfirmation(false)}
              >
                I am not a member
              </SecondaryButton>
            </div>
          </>
        )}

        {stage === 1 && (
          <>
            <p className="mb-5">
              Is your name <b>{profile?.name}</b> and is your preferred e-mail
              address{' '}
              <b>{emails?.find?.(e => e.priority === 'primary')?.email}</b>?
            </p>

            <div className="flex flex-col gap-3 mb-5">
              <Button
                onClick={() => {
                  setMembership(true);
                  setStage(3);
                }}
              >
                Yes
              </Button>
              <SecondaryButton>No</SecondaryButton>
            </div>
          </>
        )}

        {stage === 1 &&
          !isUserLoading &&
          isUserError &&
          !isPayerLoading &&
          !isPayerError &&
          !profile?.tkoalyUserId && (
            <>
              <b className="block text-center my-4">
                Are you a member of TKO-äly ry?
              </b>

              <div className="flex flex-col gap-3 items-center">
                <Button
                  onClick={() => {
                    setMembership(true);
                    setStage(2);
                  }}
                >
                  Yes, I am a member.
                </Button>
                <SecondaryButton
                  onClick={() => {
                    setMembership(false);
                    setStage(3);
                  }}
                >
                  No, I am not a member.
                </SecondaryButton>
              </div>
            </>
          )}

        {stage === 2 && (
          <>
            <p>Please login with you TKO-äly member account.</p>

            <Button
              className="bg-yellow-300 hover:bg-yellow-400 w-full text-black shadow w-60 mt-4"
              onClick={() =>
                window.location.replace(`${BACKEND_URL}/api/session/login`)
              }
            >
              Login
            </Button>
          </>
        )}

        {stage === 3 && (
          <>
            <b className="block text-center my-4">What is your name?</b>

            <TextField className="w-60" />

            <Button>Complete</Button>
          </>
        )}
      </div>
    </Dialog>
  );
};

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
      className="rounded-md border group border-gray-300 hover:border-blue-300 mt-5 shadow-sm cursor-pointer"
      onClick={() => selectable && onChangeSelected?.(!selected)}
    >
      <div className="flex items-center p-4">
        {selectable &&
          (selected ? (
            <FilledDisc
              className="text-blue-500 group-hover:text-blue-500 mr-4"
              style={{ width: '1em', strokeWidth: '2.5px' }}
            />
          ) : (
            <Circle
              className="text-gray-500 group-hover:text-blue-500 mr-4"
              style={{ width: '1em', strokeWidth: '2.5px' }}
            />
          ))}
        <div>
          <h4 className="mb-0">{title}</h4>
          <div className="text-gray-400 mr-2 text-sm">{subtitle}</div>
        </div>
        <div className="flex-grow" />
        {status && (
          <div
            className={`py-0.5 px-1 text-xs rounded-sm mx-2 font-bold ${status.className}`}
          >
            {status.label}
          </div>
        )}
        <span className="font-bold text-gray-600">{formatEuro(amount)}</span>
      </div>
      <div className="border-t px-2.5 py-3 flex gap-1">{actions}</div>
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
    className={`uppercase text-xs font-bold py-1.5 px-2 rounded ${className}`}
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
  const { data: debts } = useGetPayerDebtsQuery({ id: 'me' });
  const { data: payments } = useGetOwnPaymentsQuery();
  const { data: profile } = useGetPayerQuery('me');
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
      <h3 className="text-xl text-gray-500 font-bold">
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

      <WelcomeDialog />

      <h3 className="border-b-2 text-xl font-bold pb-1 mt-5 text-gray-600">
        {t('unpaidDebts')}
      </h3>

      {unpaidDepts.map(debt => (
        <DebtCard key={debt.id} debt={debt} />
      ))}

      {unpaidDepts.length === 0 && (
        <div className="py-3 flex items-center text-gray-600 gap-3 px-3 bg-gray-100 border shadow border-gray-300 rounded-md mt-3">
          <Info />
          {t('noUnpaidDebts')}
        </div>
      )}

      <h3 className="border-b-2 text-xl font-bold pb-1 mt-5 text-gray-600">
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
        <div className="py-3 flex items-center text-gray-600 gap-3 px-3 bg-gray-100 border shadow border-gray-300 rounded-md mt-3">
          <Info />
          {t('noOpenInvoices')}
        </div>
      )}

      <h3 className="border-b-2 text-xl font-bold pb-1 mt-5 text-gray-600">
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
        <div className="py-3 flex items-center text-gray-600 gap-3 px-3 bg-gray-100 border shadow border-gray-300 rounded-md mt-3">
          <Info />
          {t('noClosedInvoices')}
        </div>
      )}

      <h3 className="border-b-2 text-xl font-bold pb-1 mt-5 text-gray-600">
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
        <div className="py-3 flex items-center text-gray-600 gap-3 px-3 bg-gray-50 border shadow border-gray-300 rounded-md mt-3">
          <Info />
          {t('noPaidDebts')}
        </div>
      )}
    </>
  );
};
