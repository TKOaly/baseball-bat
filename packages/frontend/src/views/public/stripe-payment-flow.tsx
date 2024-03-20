import { StripeElementsOptions, loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from '@stripe/react-stripe-js';
import { Button } from '@bbat/ui/button';
import { useMemo, useState } from 'react';
import { useGetDebtsByPaymentQuery } from '../../api/debt';
import { useTranslation } from 'react-i18next';
import { PaymentBreakdown } from '../../components/payment-breakdown';
import { APP_URL } from '../../config';
import { useLocation } from 'wouter';
import stripeApi from '../../api/stripe';

export interface Props {
  params: {
    id: string;
    secret: string;
  };
}

type PaymentFormProps = {
  id: string;
  secret: string;
};

declare global {
  interface Window {
    TEST_APP_URL: string;
  }
}

const PaymentForm = ({ id, secret }: PaymentFormProps) => {
  const [, navigate] = useLocation();
  const [stripeReady, setStripeReady] = useState(false);
  const stripe = useStripe();
  const elements = useElements();
  const { t } = useTranslation();
  const { data: debts } = useGetDebtsByPaymentQuery(id);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!stripe || !elements) {
      return;
    }

    setIsLoading(true);

    const return_url = `${window.TEST_APP_URL ?? APP_URL}/payments/${id}/stripe/${secret}/return`;

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url,
      },
    });

    setIsLoading(false);

    if (
      (error.type === 'card_error' || error.type === 'validation_error') &&
      error.message
    ) {
      setErrorMessage(error.message);
    } else {
      setErrorMessage(t('unknownStripeErrorMessage'));
    }
  };

  return (
    <div className="rounded-md bg-white/90 p-8 shadow-xl">
      <h3 className="text-2xl">{t('stripeFlowHeading')}</h3>
      <p className="mb-5 mt-3 text-sm text-gray-600">
        {t('stripeLongDescription')}
      </p>
      <div className="mb-4">{debts && <PaymentBreakdown debts={debts} />}</div>
      <h3 className="mb-3 mt-5 border-b border-gray-300 pb-1 text-lg font-normal">
        {t('selectPaymentMethod')}
      </h3>
      <p className="mb-5 mt-3 text-sm text-gray-600">
        {t('stripeInstructions')}
      </p>
      {errorMessage !== null && (
        <div className="mb-5 rounded-md border border-red-300 bg-red-50 p-2 text-sm text-red-800 shadow-md shadow-red-700/10">
          <h4 className="mb-1 font-bold">{t('stripeErrorHeader')}</h4>
          <p>{errorMessage}</p>
        </div>
      )}
      <div data-stripe-ready={stripeReady}>
        <PaymentElement
          onReady={() => setStripeReady(true)}
          options={{
            layout: 'accordion',
          }}
        />
      </div>
      <div className="mt-5 flex items-center gap-4">
        <Button
          className="h-10 bg-yellow-400 px-5 text-black/80 hover:bg-yellow-500"
          disabled={!stripe || !elements}
          loading={isLoading}
          onClick={handleSubmit}
          data-testid="pay-now"
        >
          {t('payNow')}
        </Button>
        <Button onClick={() => navigate(`/`)} secondary className="h-10 px-4">
          Takaisin
        </Button>
      </div>
    </div>
  );
};

export const StripePaymentFlow = (props: Props) => {
  const [getStripeConfig] = stripeApi.endpoints.getConfig.useLazyQuery();

  const stripePromise = useMemo(async () => {
    const { data } = await getStripeConfig();

    console.log('Key', data);

    if (!data) {
      return null;
    }

    return loadStripe(data.publicKey);
  }, []);

  const options: StripeElementsOptions = {
    clientSecret: props.params.secret,
    appearance: {
      theme: 'stripe',
      rules: {
        '.AccordionItem': { borderColor: 'rgb(209 213 219)' },
        '.Input': { borderColor: 'rgb(209 213 219)' },
      },
    },
  };

  return (
    <div>
      <Elements options={options} stripe={stripePromise}>
        <PaymentForm id={props.params.id} secret={props.params.secret} />
      </Elements>
    </div>
  );
};
