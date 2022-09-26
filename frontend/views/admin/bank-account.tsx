import { Breadcrumbs } from '../../components/breadcrumbs'
import { Page, Header, Title, Section, TextField, SectionContent } from '../../components/resource-page/resource-page'
import { useGetBankAccountQuery } from '../../api/banking/accounts'
import { Button } from '../../components/button'
import { TransactionList } from '../../components/transaction-list'
import { useLocation } from 'wouter'
import { TableView } from '../../components/table-view'
import { useGetAccountTransactionsQuery } from '../../api/banking/transactions'
import { cents, formatEuro } from '../../../common/currency'
import { format, parseISO } from 'date-fns'
import { useGetBankAccountStatementsQuery } from '../../api/banking/statements'

export const BankAccount = ({ iban }: { iban: string }) => {
  const [, setLocation] = useLocation()
  const { data: account, isLoading } = useGetBankAccountQuery(iban)
  const { data: transactions } = useGetAccountTransactionsQuery(iban)
  const { data: statements } = useGetBankAccountStatementsQuery(iban)

  if (isLoading) {
    return 'Loading...'
  }

  return (
    <Page>
      <Header>
        <Title>
          <Breadcrumbs
            segments={[
              { text: 'Banking', url: '/admin/banking' },
              { text: 'Accounts', url: '/admin/banking/accounts' },
              account?.name ?? '',
            ]}
          />
        </Title>
      </Header>
      <Section title="Details" columns={2}>
        <TextField label="Name" value={account.name} />
        <TextField label="IBAN" value={account.iban} />
      </Section>
      <Section title="Statements">
        <SectionContent>
          <Button onClick={() => setLocation('/admin/banking/import-statement')}>Import bank statement</Button>
          <TableView
            rows={(statements ?? []).map(tx => ({ ...tx, key: tx.id }))}
            onRowClick={(row) => setLocation(`/admin/banking/statements/${row.id}`)}
            columns={[
              {
                name: 'Start Date',
                getValue: (stmt) => new Date(stmt.openingBalance.date),
                render: (date) => format(date, 'dd.MM.yyyy'),
              },
              {
                name: 'End Date',
                getValue: (stmt) => new Date(stmt.closingBalance.date),
                render: (date) => format(date, 'dd.MM.yyyy'),
              },
              {
                name: 'Opening Balance',
                getValue: (stmt) => stmt.openingBalance.amount.value,
                render: (amount) => formatEuro(cents(amount)),
              },
              {
                name: 'Closing Balance',
                getValue: (stmt) => stmt.closingBalance.amount.value,
                render: (amount) => formatEuro(cents(amount)),
              },
              {
                name: 'Generated',
                getValue: (stmt) => new Date(stmt.generatedAt),
                render: (date) => format(date, 'dd.MM.yyyy'),
              },
            ]}
          />
        </SectionContent>
      </Section>
      <Section title="Transactions">
        <SectionContent>
          <TransactionList transactions={transactions ?? []} />
        </SectionContent>
      </Section>
    </Page>
  )
}
