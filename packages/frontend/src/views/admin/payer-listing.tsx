import payersApi, { useSendPayerDebtReminderMutation } from '../../api/payers';
import { useLocation } from 'wouter';
import { cents, formatEuro } from '@bbat/common/src/currency';
import { useDialog } from '../../components/dialog';
import { RemindersSentDialog } from '../../components/dialogs/reminders-sent-dialog';
import { SendRemindersDialog } from '../../components/dialogs/send-reminders-dialog';
import * as N from 'fp-ts/number';
import * as monoid from 'fp-ts/Monoid';
import * as A from 'fp-ts/Array';
import * as E from 'fp-ts/Either';
import * as TE from 'fp-ts/TaskEither';
import { pipe } from 'fp-ts/function';
import { ErrorDialog } from '../../components/dialogs/error-dialog';
import { MergeProfilesDialog } from '../../components/dialogs/merge-profiles-dialog';
import { useState } from 'react';
import { PayerProfile } from '@bbat/common/src/types';
import { InfiniteTable } from '../../components/infinite-table';

export const PayerListing = () => {
  const [, setLocation] = useLocation();
  const [sendPayerDebtReminder] = useSendPayerDebtReminderMutation();
  const showRemindersSentDialog = useDialog(RemindersSentDialog);
  const showSendRemindersDialog = useDialog(SendRemindersDialog);
  const showErrorDialog = useDialog(ErrorDialog);
  const showMergeProfilesDialog = useDialog(MergeProfilesDialog);
  const [showDisabled, setShowDisabled] = useState(false);

  return (
    <div>
      <h1 className="md-5 mt-10 text-2xl">Payers</h1>

      <div className="my-4 flex items-center">
        <input
          type="checkbox"
          checked={showDisabled}
          className="h-4 w-4 rounded border-gray-300 border-gray-600 bg-gray-100 bg-gray-700 text-blue-600 ring-offset-gray-800 focus:ring-2 focus:ring-blue-500 focus:ring-blue-600"
          onClick={evt => setShowDisabled(evt.currentTarget.checked)}
          id="show-disabled-checkbox"
        />
        <label
          htmlFor="show-disabled-checkbox"
          className="ml-2 text-sm font-medium text-gray-300 text-gray-900"
        >
          Show disabled profiles
        </label>
      </div>

      <InfiniteTable
        selectable
        endpoint={payersApi.endpoints.getPayers}
        persist="payers"
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
                ({ id }: PayerProfile) =>
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
            key: 'name',
            getValue: 'name',
          },
          {
            name: 'Email',
            key: 'primary_email',
            getValue: 'primaryEmail',
          },
          {
            name: 'Membership',
            key: 'tkoaly_user_id',
            getValue: p => (p.tkoalyUserId?.value ? 'Member' : 'Non-member'),
            render: (_, p) =>
              p.tkoalyUserId?.value ? (
                <span className="rounded-[2pt] bg-blue-500 px-1.5 py-0.5 text-xs font-bold text-white">
                  Member
                </span>
              ) : (
                <span className="rounded-[2pt] bg-gray-300 px-1.5 py-0.5 text-xs font-bold text-gray-700">
                  Non-member
                </span>
              ),
          },
          ...(!showDisabled
            ? []
            : [
                {
                  name: 'Disabled',
                  key: 'disabled',
                  getValue: (p: PayerProfile) => (p.disabled ? 'Yes' : 'No'),
                  render: (_: any, p: PayerProfile) =>
                    p.disabled ? (
                      <span className="rounded-[2pt] bg-red-600 px-1.5 py-0.5 text-xs font-bold text-white">
                        Yes
                      </span>
                    ) : (
                      <span className="rounded-[2pt] bg-gray-300 px-1.5 py-0.5 text-xs font-bold text-gray-700">
                        No
                      </span>
                    ),
                },
              ]),
          {
            name: 'Paid percentage',
            key: 'paid_ratio',
            getValue: 'paidRatio',
            render: value => (
              <div className="w-full">
                <div className="text-xs">{(value * 100).toFixed(0)}%</div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
                  <div
                    className="h-full bg-green-400"
                    style={{ width: `${(value * 100).toFixed()}%` }}
                  />
                </div>
              </div>
            ),
          },
          {
            name: 'Paid',
            key: 'paid_count',
            getValue: 'paidCount',
            align: 'right',
          },
          {
            name: 'Debts Count',
            key: 'debt_count',
            getValue: 'debtCount',
            align: 'right',
          },
          {
            name: 'Paid value',
            key: 'total_paid',
            getValue: row => row.totalPaid?.value ?? 0,
            align: 'right',
            render: value => formatEuro(cents(value)),
          },
          {
            name: 'Unpaid value',
            key: 'unpaid_value',
            getValue: row => row.unpaidValue ?? cents(0),
            align: 'right',
            compareBy: value => value.value,
            render: value => formatEuro(value),
          },
          {
            name: 'Total value',
            key: 'total',
            getValue: row => row.total?.value ?? 0,
            align: 'right',
            render: value => formatEuro(cents(value)),
          },
        ]}
      />
    </div>
  );
};
