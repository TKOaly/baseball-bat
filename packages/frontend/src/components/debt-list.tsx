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
import * as R from 'remeda';
import { isBefore } from 'date-fns/isBefore';
import { formatEuro } from '@bbat/common/src/currency';
import {
  Props as InfiniteTableProps,
  InfiniteTable,
  PaginatedBaseQuery,
} from './infinite-table';
import { ComponentProps } from 'react';
import { Table } from '@bbat/ui/src/table';
import { SendRemindersDialog } from './dialogs/send-reminders-dialog';

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
  const showReminderDialog = useDialog(SendRemindersDialog);

  const commonProps: Common<
    ComponentProps<typeof Table<DebtWithPayer & { key: string }, any, any>>,
    ComponentProps<typeof InfiniteTable<DebtWithPayer & { key: string }, any>>
  > = {
    onFilterChange: undefined,
    onRowClick: (row: DebtWithPayer) => setLocation(`/admin/debts/${row.id}`),
    selectable: true,
    columns: [
      {
        key: 'human_id',
        name: 'Identifier',
        getValue: 'humanId',
        filter: {
          search: true,
          pushdown: true,
        },
      },
      {
        key: 'name',
        name: 'Name',
        getValue: 'name',
        width: '1fr',
        filter: {
          search: true,
          pushdown: true,
        },
      },
      {
        key: 'payer_name',
        name: 'Payer',
        filter: {
          search: true,
          range: {
            min: 10,
            max: 100,
            step: 1,
          },
          options: ['values'],
          pushdown: (value, include) => ({
            payer_id: { [include ? 'eq' : 'neq']: value.split(':')[0] },
          }),
        },
        getValue: row => `${row.payer.id.value}:${row.payer.name}`,
        render: value => {
          const [id, name] = value.split(':', 2);

          return (
            <Link
              onClick={e => e.stopPropagation()}
              to={`/admin/payers/${id}`}
              className="flex items-center gap-1"
            >
              {name} <ExternalLink className="h-4 text-blue-500" />
            </Link>
          );
        },
      },
      {
        key: 'status',
        name: 'Status',
        filter: {
          options: [
            ['paid'],
            ['unpaid'],
            ['mispaid'],
            ['credited'],
            ['draft'],
            ['overdue'],
          ],
          pushdown: (value, include) => {
            if (value === 'draft') {
              return {
                published_at: { [include ? 'is_null' : 'is_not_null']: 'true' },
              };
            } else if (value === 'credited') {
              return { credited: { [include ? 'eq' : 'neq']: 'true' } };
            } else if (value === 'overdue') {
              return {
                status: { [include ? 'is_overdue' : 'is_not_overdue']: 'true' },
              };
            }
          },
        },
        getValue: row => {
          const statuses = {
            credited: row.credited,
            draft: row.draft,
            paid: row.status === 'paid',
            unpaid: row.status === 'unpaid',
            mispaid: row.status === 'mispaid',
            overdue:
              row.status === 'unpaid' &&
              !row.credited &&
              !!row.dueDate &&
              isBefore(row.dueDate, new Date()),
          };

          return R.keys(R.pickBy(statuses, R.identity));
        },
        render: (value: string[]) =>
          value.map(value => {
            return {
              draft: (
                <span className="mr-1 rounded-[2pt] bg-gray-500 px-1.5 py-0.5 text-xs font-bold text-white">
                  Draft
                </span>
              ),
              unpaid: (
                <span className="mr-1 rounded-[2pt] bg-gray-300 px-1.5 py-0.5 text-xs font-bold text-gray-600">
                  Unpaid
                </span>
              ),
              mispaid: (
                <span className="mr-1 rounded-[2pt] bg-orange-500 px-1.5 py-0.5 text-xs font-bold text-white">
                  Mispaid
                </span>
              ),
              overdue: (
                <span className="mr-1 rounded-[2pt] bg-red-500 px-1.5 py-0.5 text-xs font-bold text-white">
                  Overdue
                </span>
              ),
              paid: (
                <span className="mr-1 rounded-[2pt] bg-green-500 px-1.5 py-0.5 text-xs font-bold text-white">
                  Paid
                </span>
              ),
              credited: (
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
        filter: {
          range: {
            min: 0,
            max: 200,
            step: 1,
          },
          pushdown: true,
        },
        render: formatEuro,
        compareBy: amount => amount.value,
      },
      {
        name: 'Components',
        key: 'components',
        sortable: false,
        getValue: debt => R.sortBy(debt.debtComponents, dc => dc.name),
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
        key: 'tags',
        sortable: false,
        getValue: debt => R.sortBy(debt.tags, dc => dc.name),
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
          const options = await showReminderDialog({
            debtCount: rows.length,
          });

          if (!options) {
            return;
          }

          await sendAllReminders({
            debts: rows.map(row => row.id),
            ...options,
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
