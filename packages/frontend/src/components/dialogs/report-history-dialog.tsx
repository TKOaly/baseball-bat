import {
  DialogBase,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from '../../components/dialog';
import { Button } from '@bbat/ui/button';
import { Table } from '@bbat/ui/table';
import { InternalIdentity, Report } from '@bbat/common/src/types';
import { format, parseISO } from 'date-fns';
import { CheckCircle, ExternalLink, Loader, XCircle } from 'react-feather';
import { useGetPayerQuery } from '../../api/payers';
import { Link } from 'wouter';
import { ReactNode } from 'react';

type Params = {
  onClose: () => void;
  reports: Array<Omit<Report, 'history'>>;
};

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

export const ReportHistoryDialog = ({ onClose, reports }: Params) => {
  return (
    <DialogBase wide onClose={() => onClose()}>
      <DialogHeader>Report version history</DialogHeader>
      <DialogContent>
        <Table
          hideTools
          rows={(reports ?? []).map(r => ({ ...r, key: r.id }))}
          initialSort={{
            column: 'Revision',
            direction: 'asc',
          }}
          columns={[
            {
              name: 'Revision',
              getValue: 'revision',
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
                        finished: (
                          <CheckCircle className="text-green-600 h-4" />
                        ),
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
                    disabled={report.status !== 'finished'}
                    small
                    onClick={() => {
                      window.open(
                        `/api/reports/${report.id}/content`,
                        '_blank',
                      );
                    }}
                  >
                    View
                  </Button>
                </div>
              ),
            },
          ]}
        />
      </DialogContent>
      <DialogFooter>
        <Button onClick={() => onClose()}>Close</Button>
      </DialogFooter>
    </DialogBase>
  );
};
