import { Breadcrumbs } from '../../components/breadcrumbs'
import { Page, Header, Title, Section, TextField, SectionDescription, SectionContent } from '../../components/resource-page/resource-page'
import { useGetDebtCenterQuery } from '../../api/debt-centers'
import { DebtList } from '../../components/debt-list'
import { useLocation } from 'wouter';
import { TableView } from '../../components/table-view'
import { useGetDebtComponentsByCenterQuery, useGetDebtsByCenterQuery } from '../../api/debt';
import { formatEuro } from '../../../common/currency';
import { Button, SecondaryButton } from '../../components/button'

export const DebtCenterDetails = ({ id }) => {
  const [, setLocation] = useLocation()
  const { data: debtCenter, isLoading } = useGetDebtCenterQuery(id)
  const { data: components } = useGetDebtComponentsByCenterQuery(id)
  const { data: debts } = useGetDebtsByCenterQuery(id)

  if (isLoading || !debtCenter) {
    return (
      <div>
        Loading....
      </div>
    );
  }

  return (
    <Page>
      <Header>
        <Title>
          <Breadcrumbs
            segments={[
              { text: 'Debt Centers', url: '/admin' },
              debtCenter.name,
            ]}
          />
        </Title>
      </Header>
      <Section title="Details" columns={2}>
        <TextField label="Name" value={debtCenter.name} />
        <TextField label="Description" value={debtCenter.description} fullWidth />
      </Section>
      <Section title="Debt Components">
        <SectionContent>
          <TableView
            rows={(components ?? [])}
            columns={[
              { name: 'Name', getValue: 'name' },
              {
                name: 'Amount',
                getValue: (row) => row.amount.value,
                render: (_value, row) => <div className="align-self-end">{formatEuro(row.amount)}</div>,
                align: 'right',
              },
              {
                name: 'Description',
                getValue: 'description',
              },
            ]}
            onRowClick={() => { }}
          />
        </SectionContent>
      </Section>
      <Section title="Debts">
        <SectionDescription>
          <div className="col-span-full flex gap-3">
            <Button onClick={() => setLocation(`/admin/debt-centers/${debtCenter.id}/create-debt`)}>Create Debt</Button>
            <SecondaryButton onClick={() => setLocation(`/admin/debt-centers/${debtCenter.id}/create-debts-csv`)}>Import from CSV</SecondaryButton>
          </div>
        </SectionDescription>
        <SectionContent>
          <DebtList debts={debts ?? []} />
        </SectionContent>
      </Section>
    </Page>
  );
};
