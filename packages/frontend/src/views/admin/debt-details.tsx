import { Breadcrumbs } from '@bbat/ui/breadcrumbs';
import {
  useCreditDebtMutation,
  useDeleteDebtMutation,
  useGetDebtQuery,
  useMarkPaidWithCashMutation,
  usePublishDebtsMutation,
  useSendReminderMutation,
} from '../../api/debt';
import paymentsApi from '../../api/payments';
import { PaymentList } from '../../components/payment-list';
import { TabularFieldList } from '../../components/tabular-field-list';
import { format } from 'date-fns/format';
import { isPast } from 'date-fns/isPast';
import { TextField as InputTextField } from '@bbat/ui/text-field';
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
import { Link, RouteComponentProps, useLocation } from 'wouter';
import { euro, sumEuroValues } from '@bbat/common/src/currency';
import React from 'react';
import { useDialog } from '../../components/dialog';
import { RemindersSentDialog } from '../../components/dialogs/reminders-sent-dialog';
import emailApi from '../../api/email';
import { EmailList } from '../../components/email-list';
import { ResourceLink } from '../../components/resource-link';

type Props = RouteComponentProps<{ id: string }>;

export const DebtDetails = ({ params }: Props) => {
  const { data: debt, isLoading } = useGetDebtQuery(params.id);
  const [deleteDebt] = useDeleteDebtMutation();
  const showRemindersSentDialog = useDialog(RemindersSentDialog);
  const [creditDebt] = useCreditDebtMutation();
  const [markPaidWithCash] = useMarkPaidWithCashMutation();
  const [, setLocation] = useLocation();
  const [publishDebts] = usePublishDebtsMutation();
  const [sendDebtReminder] = useSendReminderMutation();

  if (isLoading || !debt) {
    return <div>Loading...</div>;
  }

  const handleDelete = async () => {
    await deleteDebt(params.id);
    history.back();
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
  } else if (debt.status === 'mispaid') {
    statusBadge = {
      text: 'Paid',
      color: 'red',
    };
  }

  return (
    <Page>
      <Header>
        <Title>
          <Breadcrumbs
            linkComponent={Link}
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
          {debt?.draft === false && debt.dueDate && isPast(debt.dueDate) && (
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
          <div className="flex">
            {debt.publishedAt === null
              ? 'Not published'
              : format(new Date(debt.publishedAt), 'dd.MM.yyyy HH:mm')}
            {debt.publishedBy && (
              <>
                <div className="mx-1">{' by '}</div>
                <ResourceLink type="payer" id={debt.publishedBy.value} />
              </>
            )}
          </div>
        </Field>
        {debt.creditedAt && (
          <Field label="Credited at">
            <div className="flex">
              {format(new Date(debt.creditedAt), 'dd.MM.yyyy HH:mm')}
              {debt.creditedBy && (
                <>
                  <div className="mx-1">{' by '}</div>
                  <ResourceLink type="payer" id={debt.creditedBy.value} />
                </>
              )}
            </div>
          </Field>
        )}
        {debt.dueDate !== null && (
          <Field label="Due Date">
            {format(debt.dueDate, 'dd.MM.yyyy')}
            {isPast(debt.dueDate) && (
              <div
                className={
                  'ml-2 inline-block rounded-full bg-red-600 px-2.5 py-1 text-sm text-white'
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
        <Field label="Marked as paid">
          {debt.markedAsPaid === null
            ? 'Not marked as paid'
            : format(new Date(debt.markedAsPaid), 'dd.MM.yyyy HH:mm')}
        </Field>
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
              key: c.id,
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
          <PaymentList
            endpoint={paymentsApi.endpoints.getPaymentsByDebt}
            query={{ debtId: params.id }}
          />
        </SectionContent>
      </Section>
      <Section title="Emails">
        <SectionDescription>
          List of email communication regarding this debt.
        </SectionDescription>
        <SectionContent>
          <EmailList
            endpoint={emailApi.endpoints.getEmailsByDebt}
            query={{ debtId: params.id }}
          />
        </SectionContent>
      </Section>
    </Page>
  );
};
