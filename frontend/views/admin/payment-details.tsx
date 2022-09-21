import { Breadcrumbs } from '../../components/breadcrumbs'
import { useCreditPaymentMutation, useGetPaymentQuery } from '../../api/payments'
import { Timeline } from '../../components/timeline'
import { ExternalLink } from 'react-feather'
import { DebtList } from '../../components/debt-list'
import { TableView } from '../../components/table-view'
import { SecondaryButton } from '../../components/button'
import { Link, useLocation } from 'wouter'
import { cents, euro, formatEuro, sumEuroValues } from '../../../common/currency'
import { useGetDebtsByPaymentQuery } from '../../api/debt'
import { Page, Header, Title, Actions, ActionButton, Section, TextField, BadgeField, SectionDescription, SectionContent, BadgeColor } from '../../components/resource-page/resource-page'

export const PaymentDetails = ({ params }) => {
  const { data: payment, isLoading } = useGetPaymentQuery(params.id)
  const { data: debts } = useGetDebtsByPaymentQuery(params.id)
  const [creditPayment] = useCreditPaymentMutation()
  const [, setLocation] = useLocation()

  if (isLoading || !payment) {
    return <div>Loading...</div>
  }

  let statusBadge: { text: string, color: BadgeColor } = {
    text: 'Unpaid',
    color: 'gray',
  }

  if (payment.credited) {
    statusBadge = {
      text: 'Credited',
      color: 'blue',
    }
  }

  if (payment.status === 'paid') {
    statusBadge = {
      text: 'Paid',
      color: 'green',
    }
  }

  const timelineEvents = payment.events
    .map((e) => ({
      time: new Date(e.time),
      title: {
        'created': 'Payment created',
        'payment': `Payment of ${formatEuro(cents(e.amount))} received`,
      }[e.type],
    }))

  return (
    <Page>
      <Header>
        <Title>
          <Breadcrumbs
            segments={[
              {
                text: 'Payments',
                url: '/admin/payments'
              },
              payment.payment_number ? '' + payment.payment_number : '',
            ]}
          />
        </Title>
        <Actions>
          {!payment.credited && (
            <ActionButton secondary onClick={() => creditPayment(params.id)}>Credit</ActionButton>
          )}
        </Actions>
      </Header>
      <Section title="Details" columns={2}>
        <TextField label="Name" value={payment.title} />
        <TextField label="Number" value={'' + payment.payment_number} />
        <BadgeField label="Status" {...statusBadge} />
        <TextField fullWidth label="Description" value={payment.message} />
      </Section>
      <Section title="Debts">
        <SectionDescription>

        </SectionDescription>
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
  )
}
