import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from '@stripe/react-stripe-js';
import { Button } from '@bbat/ui/button';
import { useState } from 'react';
import { useGetDebtsByPaymentQuery } from '../api/debt';
import { useTranslation } from 'react-i18next';
import { PaymentBreakdown } from '../components/payment-breakdown';

export interface Props {
  params: {
    id: string;
    secret: string;
  };
}

const stripePromise = loadStripe(process.env.STRIPE_PUBLIC_KEY);

type PaymentFormProps = {
  id: string;
  secret: string;
};

const PaymentForm = ({ id, secret }: PaymentFormProps) => {
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

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${process.env.APP_URL}/payment/${id}/stripe/${secret}/return`,
      },
    });

    setIsLoading(false);

    if (error.type === 'card_error' || error.type === 'validation_error') {
      setErrorMessage(error.message);
    } else {
      setErrorMessage(t('unknownStripeErrorMessage'));
    }
  };

  return (
    <div>
      <h3 className="text-2xl">{t('stripeFlowHeading')}</h3>
      <p className="text-sm mt-3 text-gray-600 mb-5">
        {t('stripeLongDescription')}
      </p>
      <div className="mb-4">{debts && <PaymentBreakdown debts={debts} />}</div>
      <h3 className="text-lg font-normal border-b border-gray-300 pb-1 mt-5 mb-3">
        {t('selectPaymentMethod')}
      </h3>
      <p className="text-sm mt-3 text-gray-600 mb-5">
        {t('stripeInstructions')}
      </p>
      {errorMessage !== null && (
        <div className="rounded-md p-2 border shadow-md border-red-300 bg-red-50 mb-5 text-sm text-red-800 shadow-red-700/10">
          <h4 className="font-bold mb-1">{t('stripeErrorHeader')}</h4>
          <p>{errorMessage}</p>
        </div>
      )}
      <PaymentElement
        options={{
          layout: 'accordion',
        }}
      />
      <div className="mt-4 flex gap-3 items-start">
        <Button
          disabled={!stripe || !elements}
          loading={isLoading}
          onClick={handleSubmit}
        >
          {t('payNow')}
        </Button>
      </div>
    </div>
  );
};

export const StripePaymentFlow = (props: Props) => {
  const options = {
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
