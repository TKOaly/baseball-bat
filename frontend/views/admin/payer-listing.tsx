import { TableView } from '../../components/table-view';
import {
  useGetPayersQuery,
  useSendPayerDebtReminderMutation,
} from '../../api/payers';
import { useLocation } from 'wouter';
import { cents, formatEuro } from '../../../common/currency';
import { useDialog } from '../../components/dialog';
import { RemindersSentDialog } from '../../components/dialogs/reminders-sent-dialog';
import { SendRemindersDialog } from '../../components/dialogs/send-reminders-dialog';
import { monoid } from 'fp-ts';
import * as N from 'fp-ts/lib/number';
import * as A from 'fp-ts/lib/Array';
import * as E from 'fp-ts/lib/Either';
import * as TE from 'fp-ts/lib/TaskEither';
import { pipe } from 'fp-ts/lib/function';
import { ErrorDialog } from '../../components/dialogs/error-dialog';
import { MergeProfilesDialog } from '../../components/dialogs/merge-profiles-dialog';
import { useState } from 'react';

export const PayerListing = () => {
  const [, setLocation] = useLocation();
  const { data: payers } = useGetPayersQuery();
  const [sendPayerDebtReminder] = useSendPayerDebtReminderMutation();
  const showRemindersSentDialog = useDialog(RemindersSentDialog);
  const showSendRemindersDialog = useDialog(SendRemindersDialog);
  const showErrorDialog = useDialog(ErrorDialog);
  const showMergeProfilesDialog = useDialog(MergeProfilesDialog);
  const [showDisabled, setShowDisabled] = useState(false);

  const rows = (payers ?? [])
    .filter(payer => showDisabled || !payer.disabled)
    .map(payer => ({ ...payer, key: payer.id.value }));

  return (
    <div>
      <h1 className="text-2xl mt-10 md-5">Payers</h1>

      <div className="flex items-center my-4">
        <input
          type="checkbox"
          checked={showDisabled}
          className="w-4 h-4 text-blue-600 bg-gray-100 rounded border-gray-300 focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
          onClick={evt => setShowDisabled(evt.currentTarget.checked)}
          id="show-disabled-checkbox"
        />
        <label
          htmlFor="show-disabled-checkbox"
          className="ml-2 text-sm font-medium text-gray-900 dark:text-gray-300"
        >
          Show disabled profiles
        </label>
      </div>

      <TableView
        selectable
        rows={rows}
        onRowClick={({ id }) => setLocation(`/admin/payers/${id.value}`)}
        actions={[
          {
            key: 'remind',
            text: 'Send reminder',
            onSelect: async payers => {
              const options = await showSendRemindersDialog({
                debtCount: payers.length,
              });

              if (!options) {
                return;
              }

              const sendPayerDebtReminderTask =
                ({ id }) =>
                async () => {
                  const result = await sendPayerDebtReminder({
                    payerId: id.value,
                    send: options.send,
                    ignoreCooldown: options.ignoreCooldown,
                  });

                  if ('data' in result) {
                    return E.right(result.data);
                  } else {
                    return E.left(result.error);
                  }
                };

              const ResultMonoid = monoid.struct({
                messageCount: N.MonoidSum,
                payerCount: N.MonoidSum,
                errors: A.getMonoid<string>(),
              });

              const result = await pipe(
                payers,
                A.traverse(TE.ApplicativePar)(sendPayerDebtReminderTask),
                TE.map(monoid.concatAll(ResultMonoid)),
              )();

              if (E.isRight(result)) {
                showRemindersSentDialog({
                  payerCount: result.right.payerCount,
                  debtCount: result.right.messageCount,
                });
              }
            },
          },
          {
            key: 'merge',
            text: 'Merge profiles',
            onSelect: async payers => {
              if (payers.length === 0 || payers.length > 2) {
                showErrorDialog({
                  title: 'Cannot merge profiles',
                  content: 'Profile merging works only with 1-2 profiles!',
                });

                return;
              }

              await showMergeProfilesDialog({
                primaryId: payers[0].id,
                secondaryId: payers[1]?.id,
              });
            },
          },
        ]}
        columns={[
          {
            name: 'Name',
            getValue: 'name',
          },
          {
            name: 'Email',
            getValue: p => p.emails.find(e => e.priority === 'primary').email,
          },
          {
            name: 'Membership',
            getValue: p => (p.tkoalyUserId?.value ? 'Member' : 'Non-member'),
            render: (_, p) =>
              p.tkoalyUserId?.value ? (
                <span className="py-0.5 px-1.5 rounded-[2pt] bg-blue-500 text-xs font-bold text-white">
                  Member
                </span>
              ) : (
                <span className="py-0.5 px-1.5 rounded-[2pt] bg-gray-300 text-xs font-bold text-gray-700">
                  Non-member
                </span>
              ),
          },
          ...(!showDisabled
            ? []
            : [
                {
                  name: 'Disabled',
                  getValue: p => (p.disabled ? 'Yes' : 'No'),
                  render: (_, p) =>
                    p.disabled ? (
                      <span className="py-0.5 px-1.5 rounded-[2pt] bg-red-600 text-xs font-bold text-white">
                        Yes
                      </span>
                    ) : (
                      <span className="py-0.5 px-1.5 rounded-[2pt] bg-gray-300 text-xs font-bold text-gray-700">
                        No
                      </span>
                    ),
                },
              ]),
          {
            name: 'Paid percentage',
            getValue: row =>
              row.debtCount ? row.paidCount / row.debtCount : 1,
            render: value => (
              <div className="w-full">
                <div className="text-xs">{(value * 100).toFixed(0)}%</div>
                <div className="h-1.5 bg-gray-200 w-full rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-400"
                    style={{ width: `${(value * 100).toFixed()}%` }}
                  />
                </div>
              </div>
            ),
          },
          { name: 'Paid', getValue: 'paidCount', align: 'right' },
          { name: 'Debts Count', getValue: 'debtCount', align: 'right' },
          {
            name: 'Total value',
            getValue: row => row.total.value,
            align: 'right',
            render: value => formatEuro(cents(value)),
          },
        ]}
      />
    </div>
  );
};
