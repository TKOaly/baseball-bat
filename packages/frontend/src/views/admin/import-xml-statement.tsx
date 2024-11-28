import { useEffect, useState } from 'react';
import { Button } from '@bbat/ui/button';
import * as t from 'io-ts';
import { useCreateBankStatementMutation } from '../../api/banking/statements';
import {
  CamtStatement,
  parseCamtStatement,
} from '@bbat/common/src/camt-parser';
import { Breadcrumbs } from '@bbat/ui/breadcrumbs';
import { format } from 'date-fns/format';
import { useGetBankAccountsQuery } from '../../api/banking/accounts';
import {
  euro,
  formatEuro,
  subEuroValues,
  sumEuroValues,
} from '@bbat/common/src/currency';
import { useGetJobQuery } from '../../api/jobs';
import { skipToken } from '@reduxjs/toolkit/query';
import { useLocation } from 'wouter';
import { isRight } from 'fp-ts/lib/Either';
import { AlertCircle } from 'react-feather';

const parseCamtStatementFromFile = (file: File): Promise<CamtStatement> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject('Failed to read file content.');
      } else {
        parseCamtStatement(reader.result).then(resolve, reject);
      }
    };

    reader.onerror = reject;

    reader.readAsText(file);
  });

const errorDetailsType = t.type({
  name: t.string,
  message: t.string,
  traceId: t.union([t.null, t.string]),
});

const isErrorResult = (
  result: unknown,
): result is t.TypeOf<typeof errorDetailsType> =>
  isRight(errorDetailsType.decode(result));

export const ImportXMLStatement = () => {
  const [, setLocation] = useLocation();
  const { data: accounts } = useGetBankAccountsQuery();
  const [statementFile, setStatementFile] = useState<File | null>(null);
  const [parsedStatement, setParsedStatement] = useState<CamtStatement | null>(
    null,
  );
  const [_poll, setPoll] = useState(true);
  const [jobId, setJobId] = useState<string | null>(null);
  const { data: job } = useGetJobQuery(jobId ? { id: jobId } : skipToken, {
    pollingInterval: 1000,
  });
  const [isLoading, setLoading] = useState(false);

  const [createBankStatement] = useCreateBankStatementMutation();

  const handleFileChange = async (evt: Event) => {
    const target = evt.target as HTMLInputElement;
    const file = target.files?.[0];

    if (!file) {
      return;
    }

    setStatementFile(file);
    const statement = await parseCamtStatementFromFile(file);
    setParsedStatement(statement);
  };

  const handleImport = async () => {
    if (statementFile) {
      setLoading(true);

      try {
        const result = await createBankStatement(statementFile);

        if ('data' in result) {
          setJobId(result.data.job);
        }
      } catch {
        setLoading(false);
      }
    }
  };

  const selectFile = () => {
    const el = document.createElement('input');
    el.type = 'file';

    el.addEventListener('change', handleFileChange);

    el.click();
  };

  useEffect(() => {
    if (job?.state === 'succeeded' || job?.state === 'failed') {
      setPoll(false);
      setLoading(false);
    }
  }, [job]);

  const bankStatementId =
    job?.state === 'succeeded' &&
    typeof job.result === 'object' &&
    job.result &&
    'bankStatementId' in job.result &&
    typeof job.result.bankStatementId === 'string'
      ? job.result.bankStatementId
      : null;

  return (
    <div>
      <h1 className="mb-5 mt-10 text-2xl">
        <Breadcrumbs
          segments={[
            { text: 'Banking', url: '/admin/banking' },
            'Import bank statement',
          ]}
        />
      </h1>

      {parsedStatement && (
        <div className="mb-5 rounded-md border px-3 py-2 shadow-sm">
          <table>
            <tr>
              <th className="text-gray pr-2 text-left">Period</th>
              <td>
                {format(parsedStatement.openingBalance.date, 'dd.MM.yyyy')} –{' '}
                {format(parsedStatement.closingBalance.date, 'dd.MM.yyyy')}
              </td>
            </tr>
            <tr>
              <th className="text-gray pr-2 text-left">Bank</th>
              <td>
                {parsedStatement.servicer.name} ({parsedStatement.servicer.bic})
              </td>
            </tr>
            <tr>
              <th className="text-gray pr-2 text-left">Account</th>
              <td className="flex items-center">
                {parsedStatement.account.iban}
                {accounts &&
                  accounts
                    .map(a => a.iban)
                    .indexOf(parsedStatement.account.iban) === -1 && (
                    <span className="ml-2 rounded-sm bg-red-600 px-1 py-0.5 text-xs text-white">
                      Not found!
                    </span>
                  )}
              </td>
            </tr>
            <tr>
              <th className="pr-2 text-left">Transactions</th>
              <td>{parsedStatement.entries.length}</td>
            </tr>
            <tr>
              <th className="pr-2 text-left">Debit</th>
              <td>
                {formatEuro(
                  parsedStatement.entries
                    .filter(e => e.type === 'debit')
                    .map(e => e.amount)
                    .reduce(sumEuroValues, euro(0)),
                )}
              </td>
            </tr>
            <tr>
              <th className="pr-2 text-left">Credit</th>
              <td>
                {formatEuro(
                  parsedStatement.entries
                    .filter(e => e.type === 'credit')
                    .map(e => e.amount)
                    .reduce(sumEuroValues, euro(0)),
                )}
              </td>
            </tr>
            <tr>
              <th className="pr-2 text-left">Opening balance</th>
              <td>{formatEuro(parsedStatement.openingBalance.amount)}</td>
            </tr>
            <tr>
              <th className="pr-2 text-left">Closing balance</th>
              <td>
                {formatEuro(parsedStatement.closingBalance.amount)}{' '}
                <span className="text-gray-500">
                  (
                  {formatEuro(
                    subEuroValues(
                      parsedStatement.closingBalance.amount,
                      parsedStatement.openingBalance.amount,
                    ),
                  )}
                  )
                </span>
              </td>
            </tr>
          </table>
        </div>
      )}

      {job?.state === 'failed' && isErrorResult(job.result) && (
        <div className="mb-4 flex items-stretch overflow-hidden rounded shadow-sm">
          <div className="rounded-l border-y border-l border-red-600 bg-red-500 p-2 text-white">
            <AlertCircle className="size-6" />
          </div>
          <div className="grow rounded-r border border-gray-200 p-3">
            <strong className="flex items-center gap-2 text-gray-800">
              Error occurred while importing statement!
            </strong>
            <p className="mb-4 mt-2">{job?.result.message}</p>
            <Button onClick={() => setLocation(`/admin/jobs/${job.id}`)}>
              View error details
            </Button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        {parsedStatement ? (
          <Button secondary onClick={selectFile}>
            Select another file
          </Button>
        ) : (
          <Button onClick={selectFile}>Select file</Button>
        )}
        {parsedStatement && (
          <Button loading={isLoading} onClick={handleImport}>
            Submit
          </Button>
        )}
        {job?.state === 'processing' && (
          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full bg-blue-400"
              style={{ width: `${(job?.progress * 100 ?? 0).toFixed()}%` }}
            />
          </div>
        )}
        {bankStatementId && (
          <Button
            onClick={() =>
              setLocation(`/admin/banking/statements/${bankStatementId}`)
            }
          >
            View statement
          </Button>
        )}
      </div>
    </div>
  );
};
