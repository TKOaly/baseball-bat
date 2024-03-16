import { useTranslation } from 'react-i18next';
import debtApi from '../../api/debt';
import { createMultiFetchHook } from '../../hooks/create-multi-fetch-hook';
import { useAppSelector } from '../../store';
import { ChevronRight } from 'react-feather';
import {
  useCreateInvoiceMutation,
  useCreateStripePaymentMutation,
} from '../../api/payments';
import { RouteComponentProps, useLocation } from 'wouter';
import { PaymentBreakdown } from '../../components/payment-breakdown';

const useFetchDebts = createMultiFetchHook(debtApi.endpoints.getDebt);

const InvoiceIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" {...props}>
    <path
      d="M64 0C28.7 0 0 28.7 0 64V448c0 35.3 28.7 64 64 64H320c35.3 0 64-28.7 64-64V160H256c-17.7 0-32-14.3-32-32V0H64zM256 0V128H384L256 0zM64 80c0-8.8 7.2-16 16-16h64c8.8 0 16 7.2 16 16s-7.2 16-16 16H80c-8.8 0-16-7.2-16-16zm0 64c0-8.8 7.2-16 16-16h64c8.8 0 16 7.2 16 16s-7.2 16-16 16H80c-8.8 0-16-7.2-16-16zm128 72c8.8 0 16 7.2 16 16v17.3c8.5 1.2 16.7 3.1 24.1 5.1c8.5 2.3 13.6 11 11.3 19.6s-11 13.6-19.6 11.3c-11.1-3-22-5.2-32.1-5.3c-8.4-.1-17.4 1.8-23.6 5.5c-5.7 3.4-8.1 7.3-8.1 12.8c0 3.7 1.3 6.5 7.3 10.1c6.9 4.1 16.6 7.1 29.2 10.9l.5 .1 0 0 0 0c11.3 3.4 25.3 7.6 36.3 14.6c12.1 7.6 22.4 19.7 22.7 38.2c.3 19.3-9.6 33.3-22.9 41.6c-7.7 4.8-16.4 7.6-25.1 9.1V440c0 8.8-7.2 16-16 16s-16-7.2-16-16V422.2c-11.2-2.1-21.7-5.7-30.9-8.9l0 0c-2.1-.7-4.2-1.4-6.2-2.1c-8.4-2.8-12.9-11.9-10.1-20.2s11.9-12.9 20.2-10.1c2.5 .8 4.8 1.6 7.1 2.4l0 0 0 0 0 0c13.6 4.6 24.6 8.4 36.3 8.7c9.1 .3 17.9-1.7 23.7-5.3c5.1-3.2 7.9-7.3 7.8-14c-.1-4.6-1.8-7.8-7.7-11.6c-6.8-4.3-16.5-7.4-29-11.2l-1.6-.5 0 0c-11-3.3-24.3-7.3-34.8-13.7c-12-7.2-22.6-18.9-22.7-37.3c-.1-19.4 10.8-32.8 23.8-40.5c7.5-4.4 15.8-7.2 24.1-8.7V232c0-8.8 7.2-16 16-16z"
      fill="currentColor"
    />
  </svg>
);

const StripeIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" {...props}>
    <path
      d="M155.3 154.6c0-22.3 18.6-30.9 48.4-30.9 43.4 0 98.5 13.3 141.9 36.7V26.1C298.3 7.2 251.1 0 203.8 0 88.1 0 11 60.4 11 161.4c0 157.9 216.8 132.3 216.8 200.4 0 26.4-22.9 34.9-54.7 34.9-47.2 0-108.2-19.5-156.1-45.5v128.5a396.1 396.1 0 0 0 156 32.4c118.6 0 200.3-51 200.3-153.6 0-170.2-218-139.7-218-203.9z"
      fill="currentColor"
    />
  </svg>
);

export const NewPayment = ({
  params,
}: RouteComponentProps<{ id?: string }>) => {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const [createInvoice] = useCreateInvoiceMutation();
  const [createStripePayment] = useCreateStripePaymentMutation();
  const selectedDebtIds = useAppSelector(
    state => state.paymentPool.selectedPayments,
  );

  const { data: debts } = useFetchDebts(
    params.id ? [params.id] : selectedDebtIds,
  );

  const handleCreateInvoice = async () => {
    const result = await createInvoice({
      debts: debts.map(d => d.id),
      sendEmail: true,
    });

    if ('data' in result) {
      setLocation(`/payments/${result.data.id}`);
    }
  };

  const handleCreateStripePayment = async () => {
    const result = await createStripePayment({
      debts: debts.map(d => d.id),
    });

    if ('data' in result) {
      setLocation(
        `/payments/${result.data.id}/stripe/${result.data.data!.clientSecret}`,
      );
    }
  };

  return (
    <div className="rounded-md bg-white/90 p-8 shadow-xl">
      <h3 className="text-xl font-bold text-zinc-800">
        {t('newPaymentHeader')}
      </h3>

      <p className="mb-5 mt-3 text-sm text-zinc-800">
        {t('newPaymentDescription')}
      </p>

      {debts && <PaymentBreakdown debts={debts} />}

      <h3 className="mt-10 text-xl font-bold text-zinc-800">
        {t('selectPaymentMethod')}
      </h3>

      <p className="mt-3 text-sm text-zinc-800">
        {t('selectPaymentMethodInstruction')}
      </p>

      <div>
        <div
          role="button"
          className="group mt-5 flex cursor-pointer items-center rounded-md border border-gray-300 bg-white/50 py-4 shadow-sm hover:border-blue-400"
          onClick={() => handleCreateInvoice()}
        >
          <div className="flex w-20 items-center justify-center">
            <InvoiceIcon className="size-6 text-zinc-800" />
          </div>
          <div className="flex-grow">
            <h3 className="font-bold">{t('invoice')}</h3>
            <p className="text-sm text-gray-700">{t('invoiceDescription')}</p>
          </div>
          <ChevronRight className="mx-3 h-8 w-8 rounded-full text-gray-400 hover:bg-gray-200" />
        </div>

        {import.meta.env.DEV && (
          <div
            role="button"
            data-testid="stripe-button"
            className="group mt-5 flex cursor-pointer items-center rounded-md border border-gray-300 bg-white/50 py-4 shadow-sm hover:border-blue-400"
            onClick={() => handleCreateStripePayment()}
          >
            <div className="flex w-20 items-center justify-center">
              <StripeIcon className="size-6 text-zinc-800" />
            </div>
            <div className="flex-grow">
              <h3 className="font-bold">{t('stripe')}</h3>
              <p className="text-sm text-gray-700">{t('stripeDescription')}</p>
            </div>
            <ChevronRight className="mx-3 h-8 w-8 rounded-full text-gray-400" />
          </div>
        )}
      </div>
    </div>
  );
};
