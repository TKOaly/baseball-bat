import { Breadcrumbs } from '../../components/breadcrumbs';
import {
  Page,
  Header,
  Title,
  Section,
  TextField,
  SectionContent,
} from '../../components/resource-page/resource-page';
import { TransactionList } from '../../components/transaction-list';
import { useGetBankStatementQuery } from '../../api/banking/statements';
import { useGetStatementTransactionsQuery } from '../../api/banking/transactions';
import { useGetBankAccountQuery } from '../../api/banking/accounts';
import { format, parseISO } from 'date-fns';
import { formatEuro } from '@bbat/common/src/currency';

export const BankStatement = ({ id }: { id: string }) => {
  const { data: statement, isLoading } = useGetBankStatementQuery(id);
  const { data: transactions } = useGetStatementTransactionsQuery(id);
  const { data: account } = useGetBankAccountQuery(statement?.accountIban, {
    skip: !statement,
  });

  if (isLoading || !statement) {
    return 'Loading...';
  }

  return (
    <Page>
      <Header>
        <Title>
          <Breadcrumbs
            segments={[
              { text: 'Banking', url: '/admin/banking' },
              { text: 'Statements', url: '/admin/banking/statements' },
              id,
            ]}
          />
        </Title>
      </Header>
      <Section title="Details" columns={2}>
        <TextField
          label="Start Date"
          value={format(
            parseISO(statement.openingBalance.date as string),
            'dd.MM.yyyy',
          )}
        />
        <TextField
          label="Opening Balance"
          value={formatEuro(statement.openingBalance.amount)}
        />
        <TextField
          label="End Date"
          value={format(
            parseISO(statement.closingBalance.date as string),
            'dd.MM.yyyy',
          )}
        />
        <TextField
          label="Closing Balance"
          value={formatEuro(statement.closingBalance.amount)}
        />
        <TextField label="Account IBAN" value={statement.accountIban} />
        <TextField label="Account" value={account?.name} />
      </Section>
      <Section title="Transactions">
        <SectionContent>
          <TransactionList transactions={transactions ?? []} />
        </SectionContent>
      </Section>
    </Page>
  );
};
