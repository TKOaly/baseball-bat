import { useEffect, useState } from 'react';
import { BankTransaction, euro, PaymentEvent } from '../../../common/types';
import { produce } from 'immer';
import {
  useDeletePaymentEventMutation,
  useRegisterTransactionMutation,
  useUpdatePaymentEventMutation,
} from '../../api/payments';
import { Button, SecondaryButton } from '../button';
import {
  DialogBase,
  DialogHeader,
  DialogContent,
  DialogFooter,
} from '../dialog';
import { ResourceSelectField } from '../resource-select-field';
import { TableView } from '../table-view';
import { v4 } from 'uuid';
import {
  compareEuroValues,
  eurosEqual,
  EuroValue,
  formatEuro,
  makeEurosNegative,
  subEuroValues,
  sumEuroValues,
} from '../../../common/currency';
import { EuroField } from '../euro-field';
import { useGetTransactionRegistrationsQuery } from '../../api/banking/transactions';
import { Loader } from 'react-feather';

export type Props = {
  transaction: BankTransaction;
  onClose: () => void;
};

type Registration = {
  id: string;
  isNew: boolean;
  amount: EuroValue;
  payment: string;
};

export const TransactionRegistrationDialog = ({
  transaction,
  onClose,
}: Props) => {
  const { data: fetchedRegistrations, isLoading } =
    useGetTransactionRegistrationsQuery(transaction.id);
  const [deletePaymentEvent] = useDeletePaymentEventMutation();
  const [registerTransaction] = useRegisterTransactionMutation();
  const [updatePaymentEvent] = useUpdatePaymentEventMutation();

  const handleRegistration = async () => {
    await Promise.all(
      fetchedRegistrations
        .filter(existingRegistration => {
          const newRegistration = registrations.find(
            r => existingRegistration.id === r.id,
          );

          return (
            newRegistration === undefined ||
            newRegistration.payment !== existingRegistration.paymentId
          );
        })
        .map(async r => {
          const result = await deletePaymentEvent(r.id);

          if ('error' in result) {
            throw new Error('Failed to delete registration!');
          }
        }),
    );

    await Promise.all(
      registrations
        .filter(formRegistration => {
          if (formRegistration.isNew) {
            return false;
          }

          const existingRegistration = fetchedRegistrations.find(
            r => formRegistration.id === r.id,
          );

          return (
            existingRegistration &&
            !eurosEqual(existingRegistration.amount, formRegistration.amount)
          );
        })
        .map(async r => {
          let amount: EuroValue;

          if (transaction.type == 'credit') {
            amount = r.amount;
          } else {
            amount = makeEurosNegative(r.amount);
          }

          const result = await updatePaymentEvent({ id: r.id, amount });

          if ('error' in result) {
            throw new Error('Failed to update registration!');
          }
        }),
    );

    await Promise.all(
      registrations
        .filter(
          r =>
            r.isNew ||
            fetchedRegistrations.find(r2 => r.id === r2.id)?.paymentId !==
              r.payment,
        )
        .map(async r => {
          let amount: EuroValue;

          if (transaction.type == 'credit') {
            amount = r.amount;
          } else {
            amount = makeEurosNegative(r.amount);
          }

          const result = await registerTransaction({
            transactionId: transaction.id,
            paymentId: r.payment,
            amount,
          });

          if ('error' in result) {
            throw new Error('Failed to register transactions!');
          }
        }),
    );

    onClose();
  };

  const [registrations, setRegistrations] = useState<Array<Registration>>([]);

  useEffect(() => {
    if (!isLoading) {
      setRegistrations(
        fetchedRegistrations.map((event: PaymentEvent) => ({
          isNew: false,
          id: event.id,
          amount: event.amount,
          payment: event.paymentId,
        })),
      );
    }
  }, [isLoading]);

  const addRow = () => {
    setRegistrations([
      ...registrations,
      {
        id: v4(),
        isNew: true,
        amount: subEuroValues(
          transaction.amount,
          registrations.map(r => r.amount).reduce(sumEuroValues, euro(0)),
        ),
        payment: null,
      },
    ]);
  };

  const setRowPayment = (rowId: string, paymentId: string) =>
    setRegistrations(
      produce(registrations, rows => {
        const row = rows.find(({ id }) => id === rowId);

        if (row) {
          row.payment = paymentId;
        }
      }),
    );

  const setRowAmount = (rowId: string, amount: EuroValue) =>
    setRegistrations(
      produce(registrations, rows => {
        const row = rows.find(({ id }) => id === rowId);

        if (row) {
          row.amount = amount;
        }
      }),
    );

  const removeRow = (rowId: string) =>
    setRegistrations(
      produce(registrations, regs => {
        const rowIndex = regs.findIndex(({ id }) => id === rowId);
        regs.splice(rowIndex, 1);
      }),
    );

  const registrationTotal = registrations
    .map(r => r.amount)
    .reduce(sumEuroValues, euro(0));

  const isValid =
    compareEuroValues(registrationTotal, transaction.amount) !== 1;

  return (
    <DialogBase onClose={() => onClose()} className="w-[40em]">
      <DialogHeader>Register transaction</DialogHeader>
      <DialogContent>
        <p className="mb-2">
          Select a payment against which to register this transaction:
        </p>
        {isLoading && <Loader />}
        {!isLoading && (
          <TableView
            hideTools
            rows={registrations.map(r => ({ key: r.id, ...r }))}
            columns={[
              {
                name: 'Amount',
                getValue: ({ amount }) => amount,
                render: (amount: EuroValue, { id }) => (
                  <EuroField
                    name=""
                    allowNegative={false}
                    value={amount.value / 100}
                    onChange={(evt: any) =>
                      setRowAmount(id, euro(evt.target.value))
                    }
                  />
                ),
              },
              {
                name: 'Payment',
                getValue: () => '',
                render: (_, { id, payment }) => (
                  <ResourceSelectField
                    type="payment"
                    value={payment ? { type: 'payment', id: payment } : null}
                    onChange={(_, { id: payment }) =>
                      setRowPayment(id, payment)
                    }
                  />
                ),
              },
              {
                name: '',
                getValue: () => '',
                render: (_, { id }) => (
                  <Button
                    small
                    className="bg-red-500 hover:bg-red-400"
                    onClick={() => removeRow(id)}
                  >
                    Remove
                  </Button>
                ),
              },
            ]}
            footer={
              <div className="flex w-full -ml-4 items-center">
                <span className="text-gray-600 text-sm">
                  Total: {formatEuro(registrationTotal)}{' '}
                  <span
                    className={
                      subEuroValues(registrationTotal, transaction.amount)
                        .value > 0
                        ? 'text-red-600'
                        : ''
                    }
                  >
                    (
                    {formatEuro(
                      subEuroValues(registrationTotal, transaction.amount),
                    )}
                    )
                  </span>
                </span>
                <div className="flex-grow" />
                <Button small onClick={addRow}>
                  Add row
                </Button>
              </div>
            }
          />
        )}
      </DialogContent>
      <DialogFooter>
        <SecondaryButton onClick={() => onClose()}>Cancel</SecondaryButton>
        <Button onClick={() => handleRegistration()} disabled={!isValid}>
          Register
        </Button>
      </DialogFooter>
    </DialogBase>
  );
};
