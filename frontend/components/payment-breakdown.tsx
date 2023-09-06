import { useTranslation } from 'react-i18next';
import { cents, euro, formatEuro, sumEuroValues } from '../../common/currency';
import { Debt } from '../../common/types';

export type Props = {
  debts: Debt[];
};

export const PaymentBreakdown = ({ debts }: Props) => {
  const { t } = useTranslation();

  return (
    <ul className="border border-gray-300 rounded-md shadow-sm">
      {debts.map(debt => (
        <li className="tabular-nums p-2 border-b border-gray-300" key={debt.id}>
          <h4 className="font-bold flex">
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
        <h4 className="font-bold flex p-2">
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
