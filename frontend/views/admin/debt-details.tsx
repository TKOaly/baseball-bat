import { Breadcrumbs } from '../../components/breadcrumbs';
import {
  useCreditDebtMutation,
  useDeleteDebtMutation,
  useGetDebtQuery,
  useMarkPaidWithCashMutation,
  usePublishDebtsMutation,
  useSendReminderMutation,
} from '../../api/debt';
import { useGetPaymentsByDebtQuery } from '../../api/payments';
import { PaymentList } from '../../components/payment-list';
import { TabularFieldList } from '../../components/tabular-field-list';
import * as dfns from 'date-fns';
import { TextField as InputTextField } from '../../components/text-field';
import { EuroField } from '../../components/euro-field';
import {
  Page,
  Header,
  Title,
  Actions,
  ActionButton,
  Section,
  Field,
  TextField,
  DateField,
  CurrencyField,
  LinkField,
  BadgeField,
  SectionDescription,
  SectionContent,
} from '../../components/resource-page/resource-page';
import { useLocation } from 'wouter';
import { euro, sumEuroValues } from '../../../common/currency';
import React from 'react';
import { useDialog } from '../../components/dialog';
import { RemindersSentDialog } from '../../components/dialogs/reminders-sent-dialog';
import { useGetEmailsByDebtQuery } from '../../api/email';
import { EmailList } from '../../components/email-list';

export const DebtDetails = ({ params }) => {
  const { data: debt, isLoading } = useGetDebtQuery(params.id);
  const { data: payments } = useGetPaymentsByDebtQuery(params.id);
  const { data: emails } = useGetEmailsByDebtQuery(params.id);
  const [deleteDebt] = useDeleteDebtMutation();
  const showRemindersSentDialog = useDialog(RemindersSentDialog);
  const [creditDebt] = useCreditDebtMutation();
  const [markPaidWithCash] = useMarkPaidWithCashMutation();
  const [, setLocation] = useLocation();
  const [publishDebts] = usePublishDebtsMutation();
  const [sendDebtReminder] = useSendReminderMutation();

  if (isLoading) {
    return <div>Loading...</div>;
  }

  const handleDelete = () => {
    deleteDebt(params.id);
  };

  const handleCredit = () => {
    creditDebt(params.id);
  };

  const handlePublish = () => {
    publishDebts([params.id]);
  };

  const handleCashPayment = () => {
    markPaidWithCash(params.id);
  };

  const handleReminder = async () => {
    const result = await sendDebtReminder({
      id: params.id,
      draft: false,
    });

    if ('data' in result) {
      showRemindersSentDialog({
        debtCount: 1,
        payerCount: 1,
      });
    }
  };

  let statusBadge: Pick<
    React.ComponentProps<typeof BadgeField>,
    'text' | 'color'
  > = {
    text: 'Unpaid',
    color: 'gray',
  };

  if (debt.draft) {
    statusBadge = {
      text: 'Draft',
      color: 'gray',
    };
  }

  if (debt.credited) {
    statusBadge = {
      text: 'Credited',
      color: 'blue',
    };
  }

  if (debt.status === 'paid') {
    statusBadge = {
      text: 'Paid',
      color: 'green',
    };
  }

  return (
    <Page>
      <Header>
        <Title>
          <Breadcrumbs
            segments={[
              {
                text: 'Debts',
                url: '/admin/debts',
              },
              debt?.name ?? '',
            ]}
          />
        </Title>
        <Actions>
          {debt?.draft === true && (
            <ActionButton onClick={handlePublish}>Publish</ActionButton>
          )}
          {debt?.draft && (
            <ActionButton secondary onClick={handleDelete}>
              Delete
            </ActionButton>
          )}
          {debt?.draft === false && debt?.credited === false && (
            <ActionButton secondary onClick={handleCredit}>
              Credit
            </ActionButton>
          )}
          {debt?.status !== 'paid' && (
            <ActionButton secondary onClick={handleCashPayment}>
              Mark paid with cash
            </ActionButton>
          )}
          {debt?.draft === false &&
            debt.dueDate &&
            dfns.isPast(debt.dueDate) && (
              <ActionButton secondary onClick={handleReminder}>
                Send reminder
              </ActionButton>
            )}
          <ActionButton
            secondary
            onClick={() => setLocation(`/admin/debts/${debt.id}/edit`)}
          >
            Edit
          </ActionButton>
        </Actions>
      </Header>
      <Section title="Details" columns={2}>
        <TextField label="Name" value={debt.name} />
        <LinkField
          label="Payer"
          text={debt.payer.name}
          to={`/admin/payers/${debt.payer.id.value}`}
        />
        <LinkField
          label="Collection"
          text={debt.debtCenter.name}
          to={`/admin/debt-centers/${debt.debtCenter.id}`}
        />
        <CurrencyField
          label="Total"
          value={debt.debtComponents
            .map(c => c.amount)
            .reduce(sumEuroValues, euro(0))}
        />
        {debt.date && <DateField label="Date" value={new Date(debt.date)} />}
        <DateField time label="Created at" value={new Date(debt.createdAt)} />
        <Field label="Published at">
          {debt.publishedAt === null
            ? 'Not published'
            : dfns.format(new Date(debt.publishedAt), 'dd.MM.yyyy HH:mm')}
        </Field>
        {debt.dueDate !== null && (
          <Field label="Due Date">
            {dfns.format(debt.dueDate, 'dd.MM.yyyy')}
            {dfns.isPast(debt.dueDate) && (
              <div
                className={
                  'ml-2 py-1 px-2.5 text-sm inline-block rounded-full text-white bg-red-600'
                }
              >
                Overdue
              </div>
            )}
          </Field>
        )}
        {debt.paymentCondition !== null && (
          <Field label="Payment Condition">
            {debt.paymentCondition === 0
              ? 'Immediately'
              : `${debt.paymentCondition} days`}
          </Field>
        )}
        <BadgeField label="Status" {...statusBadge} />
        <TextField fullWidth label="Description" value={debt.description} />
      </Section>
      <Section title="Content">
        <SectionDescription>
          This debt consists of the following components.
        </SectionDescription>
        <SectionContent>
          <TabularFieldList
            value={debt.debtComponents.map(c => ({
              ...c,
              amount: c.amount.value / 100,
            }))}
            readOnly
            columns={[
              {
                key: 'name',
                header: 'Component',
                component: InputTextField,
                props: { readOnly: true },
              },
              {
                key: 'amount',
                header: 'Price',
                component: EuroField,
                props: { readOnly: true },
              },
            ]}
            createNew={function () {
              throw new Error('Function not implemented.');
            }}
          />
        </SectionContent>
      </Section>
      <Section title="Payments">
        <SectionDescription>
          Below are listed the payments which contain this debt.
        </SectionDescription>
        <SectionContent>
          <PaymentList payments={payments ?? []} />
        </SectionContent>
      </Section>
      <Section title="Emails">
        <SectionDescription>
          List of email communication regarding this debt.
        </SectionDescription>
        <SectionContent>
          <EmailList emails={emails ?? []} />
        </SectionContent>
      </Section>
    </Page>
  );
};
