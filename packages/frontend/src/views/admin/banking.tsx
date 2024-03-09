import { ListView } from '../../components/list-view';
import { Button, SecondaryButton } from '@bbat/ui/button';
import { useGetBankAccountsQuery } from '../../api/banking/accounts';
import { useLocation } from 'wouter';
import { useAutoregisterMutation } from '../../api/banking/transactions';

export const Banking = () => {
  const { data: accounts } = useGetBankAccountsQuery();
  const [autoregister, { isLoading }] = useAutoregisterMutation();
  const [, setLocation] = useLocation();

  return (
    <>
      <h1 className="mb-5 mt-10 text-2xl">Banking</h1>
      <p className="text-md mb-7 text-gray-800"></p>
      <ListView
        actions={
          <>
            <Button
              onClick={() => setLocation('/admin/banking/accounts/create')}
            >
              Add bank account
            </Button>
            <Button
              secondary
              loading={isLoading}
              onClick={() => autoregister()}
            >
              Autoregister
            </Button>
            <SecondaryButton
              onClick={() => setLocation('/admin/banking/import-statement')}
            >
              Import bank statement
            </SecondaryButton>
          </>
        }
        items={(accounts ?? []).map(account => ({
          key: account.iban,
          title: account.name,
          description: account.iban,
          label: '',
          badges: [],
        }))}
        onSelected={item => setLocation(`/admin/banking/accounts/${item.key}`)}
      />
    </>
  );
};
