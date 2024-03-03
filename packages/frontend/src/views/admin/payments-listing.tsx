import { useGetPaymentsQuery } from '../../api/payments';
import { PaymentList } from '../../components/payment-list';

export const PaymentsListing = () => {
  const { data: payments } = useGetPaymentsQuery();

  return (
    <>
      <h1 className="text-2xl mt-10 mb-5">Payments</h1>
      <PaymentList payments={payments ?? []} />
    </>
  );
};
