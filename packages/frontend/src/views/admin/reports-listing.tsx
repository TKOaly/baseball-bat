import { format, parseISO } from 'date-fns';
import { CheckCircle, ExternalLink, Loader, XCircle } from 'react-feather';
import { Link } from 'wouter';
import { InternalIdentity } from '@bbat/common/src/types';
import { useGetPayerQuery } from '../../api/payers';
import { useGetReportsQuery, useRefreshReportMutation } from '../../api/report';
import { Button } from '@bbat/ui/button';
import { useDialog } from '../../components/dialog';
import { NewDebtLedgerDialog } from '../../components/dialogs/new-debt-ledger-dialog';
import { NewDebtStatusReportDialog } from '../../components/dialogs/new-debt-status-report-dialog';
import { NewPaymentLedgerDialog } from '../../components/dialogs/new-payment-ledger-dialog';
import { ReportHistoryDialog } from '../../components/dialogs/report-history-dialog';
import { Table } from '@bbat/ui/table';
import { ReactNode } from 'react';
import { useHistoryPersister } from '../../hooks/use-history-persister';

const UserLink = ({ id }: { id: InternalIdentity }) => {
  const { data: user } = useGetPayerQuery(id.value);

  return (
    <Link
      onClick={e => e.stopPropagation()}
      to={`/admin/payers/${id.value}`}
      className="flex gap-1 items-center"
    >
      {user?.name} <ExternalLink className="text-blue-500 h-4" />
    </Link>
  );
};

export const ReportsListing = () => {
  const { data: reports } = useGetReportsQuery(undefined, {
    pollingInterval: 3000,
  });

  const historyPersiter = useHistoryPersister();
  const showNewDebtLedgerDialog = useDialog(NewDebtLedgerDialog);
  const showNewPaymentLedgerDialog = useDialog(NewPaymentLedgerDialog);
  const showNewDebtStatusReportDialog = useDialog(NewDebtStatusReportDialog);
  const showReportHistoryDialog = useDialog(ReportHistoryDialog);
  const [refreshReport] = useRefreshReportMutation();

  const handleNewDebtLedger = async () => {
    await showNewDebtLedgerDialog({});
  };

  const handleNewPaymentLedger = async () => {
    await showNewPaymentLedgerDialog({});
  };

  const handleNewDebtStatusReport = async () => {
    await showNewDebtStatusReportDialog({});
  };

  const handleRefreshReport = async (id: string) => {
    await refreshReport(id);
  };

  return (
    <>
      <h1 className="text-2xl mt-10 mb-5">Reports</h1>

      <div className="mb-5 flex gap-3">
        <Button onClick={handleNewDebtLedger}>New Debt Ledger</Button>
        <Button onClick={handleNewPaymentLedger}>New Payment Ledger</Button>
        <Button onClick={handleNewDebtStatusReport}>
          New Debt Status Report
        </Button>
      </div>

      <Table
        persist={historyPersiter('reports')}
        initialSort={{
          column: 'Identifier',
          direction: 'asc',
        }}
        rows={(reports ?? []).map(r => ({ ...r, key: r.id }))}
        columns={[
          {
            name: 'Identifier',
            getValue: report =>
              report.revision > 1
                ? `${report.humanId} Rev. ${report.revision}`
                : report.humanId,
          },
          {
            name: 'Name',
            getValue: 'name',
          },
          {
            name: 'Generated at',
            getValue: 'generatedAt',
            render: generatedAt =>
              format(parseISO(generatedAt), 'dd.MM.yyyy HH:mm'),
          },
          {
            name: 'Generated by',
            getValue: 'generatedBy',
            render: generatedBy =>
              generatedBy ? <UserLink id={generatedBy} /> : 'Unknown', // format(parseISO(generatedAt), 'dd.MM.yyyy HH:mm'),
          },
          {
            name: 'Status',
            getValue: 'status',
            render: status => (
              <div className="flex gap-1 items-center">
                {
                  (
                    {
                      generating: (
                        <Loader className="text-blue-600 h-4 animate-[spin_3s_linear_infinite]" />
                      ),
                      failed: <XCircle className="text-red-600 h-4" />,
                      finished: <CheckCircle className="text-green-600 h-4" />,
                    } as Record<string, ReactNode>
                  )[status]
                }
                {status[0].toUpperCase() + status.substring(1)}
              </div>
            ),
          },
          {
            name: '',
            getValue: report => report,
            render: report => (
              <div className="flex gap-3">
                <Button
                  small
                  disabled={report.status !== 'finished'}
                  onClick={() => {
                    window.open(`/api/reports/${report.id}/content`, '_blank');
                  }}
                >
                  View
                </Button>
                {report.type && report.options && (
                  <Button
                    secondary
                    small
                    onClick={() => handleRefreshReport(report.id)}
                  >
                    Refresh
                  </Button>
                )}
                {report.history.length > 0 && (
                  <Button
                    secondary
                    small
                    onClick={() => {
                      showReportHistoryDialog({ reports: report.history });
                    }}
                  >
                    History
                  </Button>
                )}
              </div>
            ),
          },
        ]}
      />
    </>
  );
};
