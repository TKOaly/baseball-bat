import { DebtWithPayer } from '@bbat/common/src/types';
import { Link, useLocation } from 'wouter';
import {
  useDeleteDebtMutation,
  usePublishDebtsMutation,
  useSendAllRemindersMutation,
} from '../api/debt';
import { ExternalLink } from 'react-feather';
import { MassEditDebtsDialog } from './dialogs/mass-edit-debts-dialog';
import { useDialog } from './dialog';
import { sortBy } from 'remeda';
import { isBefore } from 'date-fns/isBefore';
import { formatEuro } from '@bbat/common/src/currency';
import {
  Props as InfiniteTableProps,
  InfiniteTable,
  PaginatedBaseQuery,
} from './infinite-table';
import { ComponentProps } from 'react';
import { Table } from '@bbat/ui/src/table';

export type Props<Q extends PaginatedBaseQuery> =
  | Omit<InfiniteTableProps<DebtWithPayer, Q>, 'columns' | 'actions'>
  | {
      debts: DebtWithPayer[];
    };

type Common<A, B> = {
  [P in keyof A & keyof B]: A[P] | B[P];
};

export const DebtList = <Q extends PaginatedBaseQuery>(props: Props<Q>) => {
  const [publishDebts] = usePublishDebtsMutation();
  const [deleteDebt] = useDeleteDebtMutation();
  const [sendAllReminders] = useSendAllRemindersMutation();
  const [, setLocation] = useLocation();
  const showMassEditDebtsDialog = useDialog(MassEditDebtsDialog);

  const commonProps: Common<
    ComponentProps<typeof Table<DebtWithPayer & { key: string }, any, any>>,
    ComponentProps<typeof InfiniteTable<DebtWithPayer & { key: string }, any>>
  > = {
    onRowClick: (row: DebtWithPayer) => setLocation(`/admin/debts/${row.id}`),
    selectable: true,
    columns: [
      { key: 'human_id', name: 'Identifier', getValue: 'humanId' },
      { key: 'name', name: 'Name', getValue: 'name' },
      {
        key: 'payer_name',
        name: 'Payer',
        getValue: row => row.payer.name,
        render: (_value, row) => (
          <Link
            onClick={e => e.stopPropagation()}
            to={`/admin/payers/${row.payer.id.value}`}
            className="flex items-center gap-1"
          >
            {row.payer.name} <ExternalLink className="h-4 text-blue-500" />
          </Link>
        ),
      },
      {
        key: 'status',
        name: 'Status',
        getValue: row => {
          const badges = [];

          if (row.credited) {
            badges.push('Credited');
          }

          if (row.draft) {
            badges.push('Draft');
          }

          if (row.status === 'paid') {
            badges.push('Paid');
          }

          if (row.status === 'unpaid') {
            badges.push('Unpaid');
          }

          if (row.status === 'mispaid') {
            badges.push('Mispaid');
          }

          if (row.dueDate && isBefore(row.dueDate, new Date())) {
            badges.push('Overdue');
          }

          return badges;
        },
        render: (value: string[]) =>
          value.map(value => {
            return {
              Draft: (
                <span className="mr-1 rounded-[2pt] bg-gray-500 px-1.5 py-0.5 text-xs font-bold text-white">
                  Draft
                </span>
              ),
              Unpaid: (
                <span className="mr-1 rounded-[2pt] bg-gray-300 px-1.5 py-0.5 text-xs font-bold text-gray-600">
                  Unpaid
                </span>
              ),
              Mispaid: (
                <span className="mr-1 rounded-[2pt] bg-red-500 px-1.5 py-0.5 text-xs font-bold text-white">
                  Mispaid
                </span>
              ),
              Overdue: (
                <span className="mr-1 rounded-[2pt] bg-red-500 px-1.5 py-0.5 text-xs font-bold text-white">
                  Overdue
                </span>
              ),
              Paid: (
                <span className="mr-1 rounded-[2pt] bg-green-500 px-1.5 py-0.5 text-xs font-bold text-white">
                  Paid
                </span>
              ),
              Credited: (
                <span className="mr-1 rounded-[2pt] bg-blue-500 px-1.5 py-0.5 text-xs font-bold text-white">
                  Credited
                </span>
              ),
            }[value];
          }),
      },
      {
        key: 'total',
        name: 'Amount',
        getValue: 'total',
        align: 'right',
        render: formatEuro,
        compareBy: amount => amount.value,
      },
      {
        name: 'Components',
        sortable: false,
        getValue: debt => sortBy(debt.debtComponents, dc => dc.name),
        compareBy: value => value.id,
        render: (value: { name: string; id: string }[]) =>
          value.map(({ name, id }) => (
            <span
              className="mr-1 whitespace-nowrap rounded-[2pt] bg-gray-300 px-1.5 py-0.5 text-xs font-bold text-gray-600"
              key={id}
            >
              {name}
            </span>
          )),
      },
      {
        name: 'Tags',
        sortable: false,
        getValue: debt => sortBy(debt.tags, dc => dc.name),
        compareBy: value => value.name,
        render: (value: { name: string }[]) =>
          value.map(({ name }) => (
            <span
              className="mr-1 whitespace-nowrap rounded-[2pt] bg-gray-300 px-1.5 py-0.5 text-xs font-bold text-gray-600"
              key={name}
            >
              {name}
            </span>
          )),
      },
    ],
    actions: [
      {
        key: 'delete',
        text: 'Delete',
        disabled: row => !row.draft,
        onSelect: async rows => {
          await Promise.all(rows.map(({ id }) => deleteDebt(id)));
        },
      },
      {
        key: 'publish',
        text: 'Publish',
        disabled: row => !row.draft,
        onSelect: async rows => {
          await publishDebts(rows.map(r => r.id));
        },
      },
      {
        key: 'send-reminder',
        text: 'Send Reminder',
        disabled: row => row.draft,
        onSelect: async rows => {
          await sendAllReminders({
            debts: rows.map(row => row.id),
            send: true,
            ignoreCooldown: true,
          });
        },
      },
      {
        key: 'edit',
        text: 'Edit',
        onSelect: async debts => {
          if (debts.length === 1) {
            setLocation(`/admin/debts/${debts[0].id}/edit`);
            return;
          }

          await showMassEditDebtsDialog({
            debts,
          });
        },
      },
    ],
    persist: 'debts',
    initialSort: {
      column: 'human_id',
      direction: 'desc',
    },
    emptyMessage: undefined,
    hideTools: undefined,
    footer: undefined,
  };

  if ('endpoint' in props) {
    return <InfiniteTable {...commonProps} {...props} />;
  } else {
    return (
      <Table
        {...commonProps}
        rows={props.debts.map(debt => ({ key: debt.id, ...debt }))}
      />
    );
  }
};
