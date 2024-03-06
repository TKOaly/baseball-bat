import { DebtWithPayer, PayerProfile } from '@bbat/common/src/types';
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
import { isBefore } from 'date-fns';
import { formatEuro } from '@bbat/common/src/currency';
import {
  InfiniteTable,
  PaginatedBaseQuery,
  PaginatedQueryDefinition,
} from './infinite-table';
import { QueryHooks } from '@reduxjs/toolkit/dist/query/react/buildHooks';

export type Props<Q extends PaginatedBaseQuery> = {
  payer?: PayerProfile;
  endpoint: QueryHooks<PaginatedQueryDefinition<DebtWithPayer, Q>>;
  query?: Omit<Q, 'cursor' | 'sort'>;
};

export const DebtList = <Q extends PaginatedBaseQuery>(props: Props<Q>) => {
  const [publishDebts] = usePublishDebtsMutation();
  const [deleteDebt] = useDeleteDebtMutation();
  const [sendAllReminders] = useSendAllRemindersMutation();
  const [, setLocation] = useLocation();
  const showMassEditDebtsDialog = useDialog(MassEditDebtsDialog);

  const TypedInfiniteTable = InfiniteTable as typeof InfiniteTable<
    DebtWithPayer,
    any
  >;

  return (
    <TypedInfiniteTable
      onRowClick={row => setLocation(`/admin/debts/${row.id}`)}
      selectable
      endpoint={props.endpoint}
      query={props.query}
      persist="debts"
      initialSort={{
        column: 'human_id',
        direction: 'desc',
      }}
      columns={[
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
              className="flex gap-1 items-center"
            >
              {row.payer.name} <ExternalLink className="text-blue-500 h-4" />
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
                  <span className="py-0.5 px-1.5 rounded-[2pt] bg-gray-500 text-xs font-bold text-white mr-1">
                    Draft
                  </span>
                ),
                Unpaid: (
                  <span className="py-0.5 px-1.5 rounded-[2pt] bg-gray-300 text-xs font-bold text-gray-600 mr-1">
                    Unpaid
                  </span>
                ),
                Mispaid: (
                  <span className="py-0.5 px-1.5 rounded-[2pt] bg-red-500 text-xs font-bold text-white mr-1">
                    Mispaid
                  </span>
                ),
                Overdue: (
                  <span className="py-0.5 px-1.5 rounded-[2pt] bg-red-500 text-xs font-bold text-white mr-1">
                    Overdue
                  </span>
                ),
                Paid: (
                  <span className="py-0.5 px-1.5 rounded-[2pt] bg-green-500 text-xs font-bold text-white mr-1">
                    Paid
                  </span>
                ),
                Credited: (
                  <span className="py-0.5 px-1.5 rounded-[2pt] bg-blue-500 text-xs font-bold text-white mr-1">
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
                className="py-0.5 whitespace-nowrap px-1.5 mr-1 rounded-[2pt] bg-gray-300 text-xs font-bold text-gray-600"
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
                className="py-0.5 whitespace-nowrap px-1.5 mr-1 rounded-[2pt] bg-gray-300 text-xs font-bold text-gray-600"
                key={name}
              >
                {name}
              </span>
            )),
        },
      ]}
      actions={[
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
      ]}
    />
  );
};
