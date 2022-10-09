import { ReactElement } from 'react'
import { ExternalLink } from 'react-feather'
import { Link } from 'wouter'
import { useGetEmailQuery } from '../../api/email'
import { useGetPayerByEmailQuery } from '../../api/payers'
import { Breadcrumbs } from '../../components/breadcrumbs'
import { Page, Header, Title, Section, TextField, SectionDescription, SectionContent, LinkField, Field, BadgeField } from '../../components/resource-page/resource-page'

export const EmailDetails = ({ params }: { params: { id: string } }) => {
  const { data: email } = useGetEmailQuery(params.id)
  const { data: payer, isLoading: isPayerLoading } = useGetPayerByEmailQuery(email?.recipient, { skip: !email })

  if (!email) {
    return <div>Loading...</div>
  }

  let status = 'Pending'

  if (email.draft) {
    status = 'Draft';
  }

  if (email.sentAt) {
    status = 'Sent';
  }

  return (
    <Page>
      <Header>
        <Title>
          <Breadcrumbs
            segments={[
              { url: '/admin/emails', text: 'Emails' },
              email?.subject ?? '',
            ]}
          />
        </Title>
      </Header>
      <Section title="Details" columns={2}>
        <TextField label="Subject" value={email.subject} />
        <TextField label="Recipient" value={email.recipient} />
        <LinkField label="Payer" text={payer?.name} to={`/admin/payers/${payer?.id?.value}`} />
        <TextField label="Used Template" value={email.template} />
        <BadgeField label="Status" color="gray" text={status} />
      </Section>
      <Section title="Preview">
        <SectionContent>
          <div className="mt-1 overflow-hidden rounded-md border shadow">
            <iframe src={`/api/emails/${params.id}/render`} className="h-[30em] w-full"></iframe>
          </div>
        </SectionContent>
      </Section>
    </Page>
  )
}
