import { useLocation } from 'wouter';
import { useGetDebtsByPaymentQuery } from '../../api/debt';
import { useTranslation } from 'react-i18next';
import { Button } from '@bbat/ui/button';
import { PaymentBreakdown } from '../../components/payment-breakdown';
import { useGetPaymentQuery } from '../../api/payments';
import { useEffect } from 'react';
import { Loader } from 'react-feather';

export type Props = {
  params: {
    id: string;
    secret: string;
  };
};

export const StripePaymentReturnPage = (props: Props) => {
  const { data: debts } = useGetDebtsByPaymentQuery(props.params.id);
  const {
    data: payment,
    isLoading: isPaymentLoading,
    refetch,
  } = useGetPaymentQuery(props.params.id);
  const [, setLocation] = useLocation();
  const { t } = useTranslation();

  const { redirect_status } = Object.fromEntries(
    new URLSearchParams(window.location.search),
  );

  useEffect(() => {
    if (!isPaymentLoading && payment && payment.status === 'unpaid') {
      const interval = setInterval(refetch, 500);
      return () => clearInterval(interval);
    }
  }, [payment, isPaymentLoading, refetch]);

  const failed = redirect_status !== 'succeeded';

  const handleRetry = () => {
    setLocation(`/payments/${props.params.id}/stripe/${props.params.secret}`);
  };

  const handleCancel = () => {
    setLocation('/');
  };

  const handleContinue = () => {
    setLocation('/');
  };

  if (!payment || payment.status === 'unpaid') {
    return (
      <div className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-md bg-white/90 p-8 shadow-xl">
        <Loader className="size-8 animate-[spin_4s_linear_infinite] text-yellow-500" />
        {t('processingPaymentMessage')}
      </div>
    );
  }

  let actions;

  if (failed) {
    actions = (
      <>
        <Button onClick={handleRetry}>{t('stripeReturnPageRetry')}</Button>
        <Button secondary onClick={handleCancel}>
          {t('stripeReturnPageCancel')}
        </Button>
      </>
    );
  } else {
    actions = (
      <>
        <Button onClick={handleContinue}>
          {t('stripeReturnPageContinue')}
        </Button>
      </>
    );
  }

  return (
    <div className="rounded-md bg-white/90 p-8 shadow-xl">
      <h3 className="text-2xl">
        {failed
          ? t('stripePaymentFailedHeader')
          : t('stripePaymentSucceededHeader')}
      </h3>
      <p className="mb-5 mt-3 text-sm text-gray-600">
        {failed
          ? t('stripePaymentFailedMessage')
          : t('stripePaymentSucceededMessage')}
      </p>
      <div className="mb-4">{debts && <PaymentBreakdown debts={debts} />}</div>
      <div className="flex items-start gap-3">{actions}</div>
    </div>
  );
};
