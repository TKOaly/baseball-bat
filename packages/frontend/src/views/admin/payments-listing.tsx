import { useGetPaymentsQuery } from '../../api/payments';
import { PaymentList } from '../../components/payment-list';

export const PaymentsListing = () => {
  const { data: payments } = useGetPaymentsQuery();

  return (
    <>
      <h1 className="mb-5 mt-10 text-2xl">Payments</h1>
      <PaymentList payments={payments ?? []} />
    </>
  );
};
