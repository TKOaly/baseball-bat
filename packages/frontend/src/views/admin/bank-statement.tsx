import { Breadcrumbs } from '@bbat/ui/breadcrumbs';
import {
  Page,
  Header,
  Title,
  Section,
  TextField,
  SectionContent,
} from '../../components/resource-page/resource-page';
import { TransactionList } from '../../components/infinite-transaction-list';
import { useGetBankStatementQuery } from '../../api/banking/statements';
import transactionsApi from '../../api/banking/transactions';
import { useGetBankAccountQuery } from '../../api/banking/accounts';
import { format } from 'date-fns';
import { formatEuro } from '@bbat/common/src/currency';
import { skipToken } from '@reduxjs/toolkit/query';

export const BankStatement = ({ id }: { id: string }) => {
  const { data: statement, isLoading } = useGetBankStatementQuery(id);
  const { data: account } = useGetBankAccountQuery(
    statement?.accountIban ?? skipToken,
  );

  if (isLoading || !statement || !account) {
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
          value={format(statement.openingBalance.date, 'dd.MM.yyyy')}
        />
        <TextField
          label="Opening Balance"
          value={formatEuro(statement.openingBalance.amount)}
        />
        <TextField
          label="End Date"
          value={format(statement.closingBalance.date, 'dd.MM.yyyy')}
        />
        <TextField
          label="Closing Balance"
          value={formatEuro(statement.closingBalance.amount)}
        />
        <TextField label="Account IBAN" value={statement.accountIban} />
        <TextField label="Account" value={account.name} />
      </Section>
      <Section title="Transactions">
        <SectionContent>
          <TransactionList
            endpoint={transactionsApi.endpoints.getStatementTransactions}
            query={{ id }}
          />
        </SectionContent>
      </Section>
    </Page>
  );
};
