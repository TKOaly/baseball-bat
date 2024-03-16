import { Breadcrumbs } from '@bbat/ui/breadcrumbs';
import { Link, RouteComponentProps } from 'wouter';
import {
  useCreditPaymentMutation,
  useGetPaymentQuery,
} from '../../api/payments';
import { Timeline } from '@bbat/ui/timeline';
import { DebtList } from '../../components/debt-list';
import { euroAbsoluteValue, formatEuro } from '@bbat/common/src/currency';
import { useGetDebtsByPaymentQuery } from '../../api/debt';
import {
  Page,
  Header,
  Title,
  Actions,
  ActionButton,
  Section,
  DateField,
  TextField,
  BadgeField,
  SectionDescription,
  SectionContent,
  BadgeColor,
} from '../../components/resource-page/resource-page';
import { isPaymentInvoice } from '@bbat/common/src/types';

type Props = RouteComponentProps<{ id: string }>;

export const PaymentDetails = ({ params }: Props) => {
  const { data: payment, isLoading } = useGetPaymentQuery(params.id);
  const { data: debts } = useGetDebtsByPaymentQuery(params.id);
  const [creditPayment] = useCreditPaymentMutation();

  if (isLoading || !payment) {
    return <div>Loading...</div>;
  }

  let statusBadge: { text: string; color: BadgeColor } = {
    text: 'Unpaid',
    color: 'gray',
  };

  if (payment.credited) {
    statusBadge = {
      text: 'Credited',
      color: 'blue',
    };
  }

  if (payment.status === 'paid') {
    statusBadge = {
      text: 'Paid',
      color: 'green',
    };
  }

  const timelineEvents = payment.events.flatMap(e => {
    let title;

    const isStripeEvent = (type: string) =>
      e.data &&
      'stripe' in e.data &&
      (e.data?.stripe as any)?.event?.type === type;

    switch (true) {
      case e.type === 'created':
        title = 'Payment created';
        break;

      case e.type === 'payment':
        title = `Payment of ${formatEuro(e.amount)} received`;
        break;

      case e.type === 'failed':
        title = 'Payment failed';
        break;

      case isStripeEvent('charge.dispute.created'):
        title = 'Payment disputed';
        break;

      case isStripeEvent('payment_intent.confirmed'):
        title = 'Payment intent confirmed.';
        break;

      case isStripeEvent('charge.dispute.funds_withdrawn'):
        title = `${formatEuro(euroAbsoluteValue(e.amount))} of funds withdrawn due to a dispute`;
        break;

      case isStripeEvent('charge.dispute.funds_reinstated'):
        title = `${formatEuro(euroAbsoluteValue(e.amount))} of funds reinstated`;
        break;

      default:
        return [];
    }

    return [
      {
        time: new Date(e.time),
        title,
      },
    ];
  });

  let invoiceDetailsSection = null;

  if (isPaymentInvoice(payment)) {
    invoiceDetailsSection = (
      <Section title="Invoice Details" columns={2}>
        <DateField label="Invoice Date" value={new Date(payment.data.date)} />
        <DateField label="Due Date" value={new Date(payment.data.due_date)} />
        <TextField
          label="Reference Number"
          value={payment.data.reference_number}
        />
      </Section>
    );
  }

  return (
    <Page>
      <Header>
        <Title>
          <Breadcrumbs
            linkComponent={Link}
            segments={[
              {
                text: 'Payments',
                url: '/admin/payments',
              },
              payment.paymentNumber ? '' + payment.paymentNumber : '',
            ]}
          />
        </Title>
        <Actions>
          {!payment.credited && (
            <ActionButton
              secondary
              onClick={async () => {
                await creditPayment(params.id);
              }}
            >
              Credit
            </ActionButton>
          )}
        </Actions>
      </Header>
      <Section title="Details" columns={2}>
        <TextField label="Name" value={payment.title} />
        <TextField label="Number" value={'' + payment.paymentNumber} />
        <BadgeField label="Status" {...statusBadge} />
        <TextField fullWidth label="Description" value={payment.message} />
      </Section>
      {invoiceDetailsSection}
      <Section title="Debts">
        <SectionDescription></SectionDescription>
        <SectionContent>
          <DebtList debts={debts ?? []} />
        </SectionContent>
      </Section>
      <Section title="Timeline">
        <SectionContent>
          <Timeline events={timelineEvents} />
        </SectionContent>
      </Section>
    </Page>
  );
};
