import { useLocation } from 'wouter';
import { useGetDebtsByPaymentQuery } from '../api/debt';
import { useTranslation } from 'react-i18next';
import { Button } from '@bbat/ui/button';
import { PaymentBreakdown } from '../components/payment-breakdown';

export type Props = {
  params: {
    id: string;
    secret: string;
  };
};

export const StripePaymentReturnPage = (props: Props) => {
  const { data: debts } = useGetDebtsByPaymentQuery(props.params.id);
  const [, setLocation] = useLocation();
  const { t } = useTranslation();

  const { redirect_status } = Object.fromEntries(
    new URLSearchParams(window.location.search),
  );

  const failed = redirect_status !== 'succeeded';

  const handleRetry = () => {
    setLocation(`/payment/${props.params.id}/stripe/${props.params.secret}`);
  };

  const handleCancel = () => {
    setLocation('/');
  };

  const handleContinue = () => {
    setLocation('/');
  };

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
    <div>
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
