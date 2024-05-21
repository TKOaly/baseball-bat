import paymentsApi from '../../api/payments';
import { PaymentList } from '../../components/payment-list';

export const PaymentsListing = () => {
  return (
    <>
      <h1 className="mb-5 mt-10 text-2xl">Payments</h1>
      <PaymentList endpoint={paymentsApi.endpoints.getPayments} />
    </>
  );
};
