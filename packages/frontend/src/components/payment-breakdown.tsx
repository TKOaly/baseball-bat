import { useTranslation } from 'react-i18next';
import {
  cents,
  euro,
  formatEuro,
  sumEuroValues,
} from '@bbat/common/src/currency';
import { Debt } from '@bbat/common/src/types';

export type Props = {
  debts: Debt[];
};

export const PaymentBreakdown = ({ debts }: Props) => {
  const { t } = useTranslation();

  return (
    <ul className="rounded-md border border-gray-300 bg-white/50 shadow-md">
      {debts.map(debt => (
        <li className="p-4 tabular-nums" key={debt.id}>
          <h4 className="flex font-bold">
            <span className="flex-grow">{debt.name}</span>
            <span>
              {formatEuro(
                debt.debtComponents
                  .map(dc => dc.amount)
                  .reduce(sumEuroValues, euro(0)),
              )}
            </span>
          </h4>
          <div className="pl-3">
            <p>{debt.description}</p>
            <ul>
              {debt.debtComponents.map(dc => (
                <li className="flex" key={dc.id}>
                  <span className="flex-grow">{dc.name}</span>
                  <span>{formatEuro(dc.amount)}</span>
                </li>
              ))}
            </ul>
          </div>
        </li>
      ))}
      <li>
        <h4 className="flex p-4 font-bold">
          <span className="flex-grow">{t('total')}</span>
          <span>
            {formatEuro(
              (debts ?? [])
                .flatMap(d => d.debtComponents)
                .map(dc => dc.amount)
                .reduce(sumEuroValues, cents(0)),
            )}
          </span>
        </h4>
      </li>
    </ul>
  );
};
