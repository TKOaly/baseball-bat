import { Breadcrumbs } from '../../components/breadcrumbs'
import { useGetPayerDebtsQuery, useGetPayerEmailsQuery, useGetPayerQuery } from '../../api/payers'
import { DebtList } from '../../components/debt-list'
import { Page, Header, Title, Section, TextField, Field, SectionContent } from '../../components/resource-page/resource-page'

export const PayerDetails = ({ params }) => {
  const { data: payer } = useGetPayerQuery(params.id)
  const { data: emails } = useGetPayerEmailsQuery(params.id)
  const { data: debts } = useGetPayerDebtsQuery({ id: params.id, includeDrafts: true })

  if (!payer || !emails)
    return 'Loading...'

  return (
    <Page>
      <Header>
        <Title>
          <Breadcrumbs
            segments={[
              { url: '/admin/payers', text: 'Payers' },
              payer?.name ?? '',
            ]}
          />
        </Title>
      </Header>
      <Section title="Details" columns={2}>
        <TextField label="Name" value={payer?.name} />
        <Field label="Emails">
          {emails.map((email) => (
            <span title={`Source: ${email.source}`} className={`rounded-[3pt] text-sm py-0.5 px-2 ${{ primary: 'bg-blue-500 text-white', default: 'bg-gray-500 text-black', disabled: 'bg-gray-200 text-gray-500' }[email.priority]}`}>{email.email}</span>
          ))}
        </Field>
      </Section>
      <Section title="Debts">
        <SectionContent>
          <DebtList debts={debts ?? []} />
        </SectionContent>
      </Section>
    </Page>
  )
}
