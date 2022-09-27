import React, { useMemo, useState } from 'react'
import { TableView } from '../../components/table-view'
import { Button } from '../../components/button'
import { cents, euro, EuroValue, formatEuro } from '../../../common/currency'
import { useGetPaymentsByReferenceNumbersQuery } from '../../api/payments'
import { useImportBankTransactionsMutation } from '../../api/banking/transactions'
import { useCreateBankStatementMutation } from '../../api/banking/statements'
import { ExternalLink } from 'react-feather';
import { useLocation } from 'wouter'
import { Payment } from '../../../common/types'
import { format, parseISO } from 'date-fns'
import { Breadcrumbs } from '../../components/breadcrumbs'

export const ImportXMLStatement = () => {
  const [statementFile, setStatementFile] = useState<File | null>(null)
  const [, setLocation] = useLocation()

  const [createBankStatement] = useCreateBankStatementMutation()

  const handleFileChange = async (evt: React.ChangeEvent<HTMLInputElement>) => {
    setStatementFile(evt.target.files[0]);
  }

  const handleImport = async () => {
    if (statementFile) {
      const result = await createBankStatement(statementFile);

      if ('data' in result) {
        setLocation(`/admin/banking/statements/${result.data.id}`)
      }
    }
  }

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

      <div>
        <input type="file" onChange={handleFileChange} />
        {statementFile && <Button onClick={handleImport}>Upload</Button>}
      </div>
    </div>
  );
};
