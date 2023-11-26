import { Breadcrumbs } from '../../components/breadcrumbs';
import {
  Page,
  Header,
  Title,
  Section,
  TextField,
  SectionDescription,
  SectionContent,
  Actions,
  ActionButton,
} from '../../components/resource-page/resource-page';
import {
  useDeleteDebtCenterMutation,
  useGetDebtCenterQuery,
} from '../../api/debt-centers';
import { DebtList } from '../../components/debt-list';
import { useLocation } from 'wouter';
import { TableView } from '../../components/table-view';
import {
  useGetDebtComponentsByCenterQuery,
  useGetDebtsByCenterQuery,
} from '../../api/debt';
import { formatEuro } from '@bbat/common/src/currency';
import { Button, SecondaryButton } from '@bbat/ui/button';
import { useDialog } from '../../components/dialog';
import { InfoDialog } from '../../components/dialogs/info-dialog';
import { NewDebtLedgerDialog } from '../../components/dialogs/new-debt-ledger-dialog';

export const DebtCenterDetails = ({ id }) => {
  const [, setLocation] = useLocation();
  const { data: debtCenter, isLoading } = useGetDebtCenterQuery(id);
  const { data: components } = useGetDebtComponentsByCenterQuery(id);
  const { data: debts } = useGetDebtsByCenterQuery(id);
  const [deleteDebtCenter] = useDeleteDebtCenterMutation();
  const showInfoDialog = useDialog(InfoDialog);
  const showNewDebtLedgerDialog = useDialog(NewDebtLedgerDialog);

  const handleDelete = async () => {
    const result = await deleteDebtCenter(id);

    if ('data' in result) {
      await showInfoDialog({
        title: 'Debt Center Deleted',
        content: `Debt center ${debtCenter.name} deleted successfully.`,
      });

      setLocation('/admin/debt-centers');
    }
  };

  if (isLoading || !debtCenter) {
    return <div>Loading....</div>;
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
        <Actions>
          {debts?.length === 0 && (
            <ActionButton secondary onClick={handleDelete}>
              Delete
            </ActionButton>
          )}
          <ActionButton
            secondary
            onClick={() =>
              showNewDebtLedgerDialog({ defaults: { center: id } })
            }
          >
            Generate Report
          </ActionButton>
          <ActionButton
            secondary
            onClick={() => setLocation(`/admin/debt-centers/${id}/edit`)}
          >
            Edit
          </ActionButton>
        </Actions>
      </Header>
      <Section title="Details" columns={2}>
        <TextField label="Name" value={debtCenter.name} />
        <TextField
          label="Description"
          value={debtCenter.description}
          fullWidth
        />
      </Section>
      <Section title="Debt Components">
        <SectionContent>
          <TableView
            rows={(components ?? []).map(component => ({
              ...component,
              key: component.id,
            }))}
            columns={[
              { name: 'Name', getValue: 'name' },
              {
                name: 'Amount',
                getValue: row => row.amount.value,
                render: (_value, row) => (
                  <div className="align-self-end">{formatEuro(row.amount)}</div>
                ),
                align: 'right',
              },
              {
                name: 'Description',
                getValue: 'description',
              },
            ]}
          />
        </SectionContent>
      </Section>
      <Section title="Debts">
        <SectionDescription>
          <div className="col-span-full flex gap-3">
            <Button
              onClick={() =>
                setLocation(`/admin/debt-centers/${debtCenter.id}/create-debt`)
              }
            >
              Create Debt
            </Button>
            <SecondaryButton
              onClick={() =>
                setLocation(
                  `/admin/debt-centers/${debtCenter.id}/create-debts-csv`,
                )
              }
            >
              Import from CSV
            </SecondaryButton>
          </div>
        </SectionDescription>
        <SectionContent>
          <DebtList debts={debts ?? []} />
        </SectionContent>
      </Section>
    </Page>
  );
};
