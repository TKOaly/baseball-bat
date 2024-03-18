import { Debt, DebtStatus } from '@bbat/common/src/types';
import { cva } from 'class-variance-authority';
import { isBefore } from 'date-fns/isBefore';
import { useTranslation } from 'react-i18next';

const debtStatusBadgeCva = cva('text-sm font-semibold py-1 px-2 rounded', {
  variants: {
    status: {
      paid: 'bg-green-200 text-green-700',
      unpaid: 'bg-blue-200 text-blue-600',
      mispaid: 'bg-orange-200 text-orange-600',
      overdue: 'bg-red-200 text-red-600',
    },
  },
});

export const DebtStatusBadge = ({ debt }: { debt: Debt }) => {
  const { t } = useTranslation([], { keyPrefix: 'debtStatusBadge' });

  let status: DebtStatus | 'overdue' = debt.status;

  if (debt.dueDate && isBefore(debt.dueDate, new Date())) {
    status = 'overdue';
  }

  return <span className={debtStatusBadgeCva({ status })}>{t(status)}</span>;
};
