import React, { useState } from 'react';
import { Button } from '../../components/button';
import { useCreateBankStatementMutation } from '../../api/banking/statements';
import { useLocation } from 'wouter';
import { CamtStatement, parseCamtStatement } from '../../../common/camt-parser';
import { Breadcrumbs } from '../../components/breadcrumbs';
import { format } from 'date-fns';
import { useGetBankAccountsQuery } from '../../api/banking/accounts';
import { euro, formatEuro, subEuroValues, sumEuroValues } from '../../../common/currency';

const parseCamtStatementFromFile = (file: File): Promise<CamtStatement> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject('Failed to read file content.');
      } else {
        parseCamtStatement(reader.result)
          .then(resolve, reject);
      }
    };

    reader.onerror = reject;

    reader.readAsText(file);
  });

export const ImportXMLStatement = () => {
  const { data: accounts } = useGetBankAccountsQuery();
  const [statementFile, setStatementFile] = useState<File | null>(null);
  const [parsedStatement, setParsedStatement] = useState<CamtStatement | null>(null);
  const [isLoading, setLoading] = useState(false); 
  const [, setLocation] = useLocation();

  const [createBankStatement] = useCreateBankStatementMutation();

  const handleFileChange = async (evt: Event) => {
    const target = evt.target as HTMLInputElement;
    const file = target.files[0];
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
          setLocation(`/admin/banking/statements/${result.data.id}`);
        }
      } finally {
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
  
  return (
    <div>
      <h1 className="text-2xl mb-5 mt-10">
        <Breadcrumbs
          segments={[
            { text: 'Banking', url: '/admin/banking' },
            'Import bank statement',
          ]}
        />
      </h1>

      { parsedStatement && (
        <div className="rounded-md px-3 py-2 border shadow-sm mb-5">
          <table>
            <tr>
              <th className="text-left pr-2 text-gray">Period</th>
              <td>{format(parsedStatement.openingBalance.date, 'dd.MM.yyyy')} – {format(parsedStatement.closingBalance.date, 'dd.MM.yyyy')}</td>
            </tr>
            <tr>
              <th className="text-left pr-2 text-gray">Bank</th>
              <td>{parsedStatement.servicer.name} ({parsedStatement.servicer.bic})</td>
            </tr>
            <tr>
              <th className="text-left pr-2 text-gray">Account</th>
              <td className="flex items-center">
                {parsedStatement.account.iban}
                {accounts && (accounts.map(a => a.iban).indexOf(parsedStatement.account.iban) === -1) && (
                  <span className="rounded-sm py-0.5 px-1 text-white text-xs bg-red-600 ml-2">Not found!</span>
                )}
              </td>
            </tr>
            <tr>
              <th className="text-left pr-2">Transactions</th>
              <td>{parsedStatement.entries.length}</td>
            </tr>
            <tr>
              <th className="text-left pr-2">Debit</th>
              <td>{formatEuro(parsedStatement.entries.filter(e => e.type === 'debit').map(e => e.amount).reduce(sumEuroValues, euro(0)))}</td>
            </tr>
            <tr>
              <th className="text-left pr-2">Credit</th>
              <td>{formatEuro(parsedStatement.entries.filter(e => e.type === 'credit').map(e => e.amount).reduce(sumEuroValues, euro(0)))}</td>
            </tr>
            <tr>
              <th className="text-left pr-2">Opening balance</th>
              <td>{formatEuro(parsedStatement.openingBalance.amount)}</td>
            </tr>
            <tr>
              <th className="text-left pr-2">Closing balance</th>
              <td>
                {formatEuro(parsedStatement.closingBalance.amount)}{' '}
                <span className="text-gray-500">({formatEuro(subEuroValues(parsedStatement.closingBalance.amount, parsedStatement.openingBalance.amount))})</span>
              </td>
            </tr>
          </table>
        </div>
      ) }

      <div className="flex gap-2">
        {
          parsedStatement
            ? <Button secondary onClick={selectFile}>Select another file</Button>
            : <Button onClick={selectFile}>Select file</Button>
        }
        { parsedStatement && <Button loading={isLoading} onClick={handleImport}>Submit</Button> }
      </div>
    </div>
  );
};
