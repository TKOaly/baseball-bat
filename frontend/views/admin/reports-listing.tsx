import { format, parseISO } from "date-fns";
import { useLocation } from "wouter";
import { useGetReportsQuery } from "../../api/report";
import { Button } from "../../components/button";
import { useDialog } from "../../components/dialog";
import { NewDebtLedgerDialog } from "../../components/dialogs/new-debt-ledger-dialog";
import { TableView } from "../../components/table-view";

export const ReportsListing = () => {
  const { data: reports } = useGetReportsQuery();
  const [, setLocation] = useLocation();
  const showNewDebtLedgerDialog = useDialog(NewDebtLedgerDialog);

  const handleNewDebtLedger = async () => {
    await showNewDebtLedgerDialog({});
  };

  return (
    <>
      <h1 className="text-2xl mt-10 mb-5">Reports</h1>

      <div className="mb-5">
        <Button onClick={handleNewDebtLedger}>New Debt Ledger</Button>
      </div>

      <TableView
        rows={(reports ?? []).map((r) => ({ ...r, key: r.id }))}
        columns={[
          {
            name: 'Name',
            getValue: 'name',
          },
          {
            name: 'Generated at',
            getValue: 'generatedAt',
            render: (generatedAt) => format(parseISO(generatedAt), 'dd.MM.yyyy HH:mm'),
          },
          {
            name: '',
            getValue: (report) => report,
            render: (report) => (
              <div className="flex gap-3">
                <Button
                  small
                  onClick={() => {
                    window.open(`/api/reports/${report.id}/content`, '_blank');
                  }}
                >
                  View
                </Button>
              </div>
            ),
          }
        ]}
      />
    </>
  );
};
