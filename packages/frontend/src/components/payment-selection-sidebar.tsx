import { useAppSelector } from '../store';
import { createMultiFetchHook } from '../hooks/create-multi-fetch-hook';
import debtApi from '../api/debt';
import { euro, formatEuro, sumEuroValues } from '@bbat/common/src/currency';
import { Button } from '@bbat/ui/button';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'wouter';

const useFetchDebts = createMultiFetchHook(debtApi.endpoints.getDebt);

export const PaymentSelectionSidebar = () => {
  const [, setLocation] = useLocation();
  const { t } = useTranslation();
  const selectedDebtIds = useAppSelector(
    state => state.paymentPool.selectedPayments,
  );
  const { data: selectedDebts } = useFetchDebts(selectedDebtIds);

  return (
    <div className="mx-3 mt-5 self-start rounded-lg border border-gray-100 bg-white p-5 shadow-lg">
      {t('selectedDebtCount', { count: selectedDebts?.length })}
      <br />
      {t('selectedDebtTotal', {
        total: formatEuro(
          selectedDebts
            .flatMap(d => d.debtComponents)
            .map(dc => dc.amount)
            .reduce(sumEuroValues, euro(0)),
        ),
      })}

      <br />
      <br />

      <Button onClick={() => setLocation('/payment/new')}>
        {t('createCombinedInvoice')}
      </Button>
    </div>
  );
};
