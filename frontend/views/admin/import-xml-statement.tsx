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

type AccountDetails = {
  iban: string
  currency: string
}

type ServicerDetails = {
  bic: string
  name: string
  postalAddress: string
}

type Balance = {
  date: Date
  amount: EuroValue
}

type StatementEntry = {
  id: string
  amount: EuroValue
  type: 'debit' | 'credit'
  bookingDate: Date
  valueDate: Date
  otherParty: {
    name: string
    account: string
  }
  reference?: string
  message?: string
}

type CamtStatement = {
  creationDateTime: Date
  account: AccountDetails
  servicer: ServicerDetails
  openingBalance: Balance
  closingBalance: Balance
  entries: StatementEntry[]
}

const parseEuroValue = (value: string): EuroValue => {
  return euro(parseFloat(value))
}

const parseCAMT = (content: string): CamtStatement => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(content, "application/xml");

  const find = (selector: string, root: Document | Element = doc) => root.querySelector(selector)?.firstChild?.nodeValue

  const balances = [...doc.querySelectorAll('BkToCstmrAcctRpt Rpt Bal')]
    .map((bal) => ({
      type: find('Tp CdOrPrtry Cd', bal),
      amount: parseEuroValue(find('Amt', bal)),
      date: new Date(find('Dt Dt', bal)),
    }));

  const openingBalance = balances.find(bal => bal.type === 'OPBD')
  const closingBalance = balances.find(bal => bal.type === 'CLBD')

  const entries: StatementEntry[] = [...doc.querySelectorAll('BkToCstmrAcctRpt Rpt Ntry')]
    .map((ntry) => {
      const cdtDbtInd = find('CdtDbtInd', ntry)
      let type: 'debit' | 'credit'

      if (cdtDbtInd === 'DBIT') {
        type = 'debit'
      } else if (cdtDbtInd === 'CRDT') {
        type = 'credit'
      } else {
        throw new Error('Invalid statement entry cdtDbtInd: ' + cdtDbtInd)
      }

      return {
        id: find('NtryDtls TxDtls Refs MsgId', ntry),
        amount: parseEuroValue(find('Amt', ntry)),
        type,
        bookingDate: parseISO(find('BookgDt Dt', ntry)),
        valueDate: parseISO(find('ValDt Dt', ntry)),
        otherParty: type === 'debit'
          ? {
            name: find('NtryDtls TxDtls RltdPties Cdtr Nm', ntry),
            account: find('NtryDtls TxDtls RltdPties CdtrAcct Id IBAN', ntry),
          }
          : {
            name: find('NtryDtls TxDtls RltdPties Dbtr Nm', ntry),
            account: find('NtryDtls TxDtls RltdPties DbtrAcct Id IBAN', ntry),
          },
        reference: find('NtryDtls TxDtls RmtInf Strd CdtrRefInf Ref', ntry),
        message: find('NtryDtls TxDtls RmtInf Ustrd', ntry),
      }
    });

  return {
    creationDateTime: parseISO(find('BkToCstmrAcctRpt Rpt CreDtTm')),
    account: {
      iban: find('BkToCstmrAcctRpt Rpt Acct Id IBAN'),
      currency: find('BkToCstmrAcctRpt Rpt Acct Id Ccy'),
    },
    servicer: {
      bic: find('BkToCstmrAcctRpt Rpt Acct Svcr FinInstnId BIC'),
      name: find('BkToCstmrAcctRpt Rpt Acct Svcr FinInstnId Nm'),
      postalAddress: find('BkToCstmrAcctRpt Rpt Acct Svcr FinInstnId PstlAdr StrtNm'),
    },
    openingBalance,
    closingBalance,
    entries,
  }
}

export const ImportXMLStatement = () => {
  const [received, setReceived] = useState<Array<StatementEntry>>([])
  const [statement, setStatement] = useState<CamtStatement | null>(null)
  const [statementFile, setStatementFile] = useState<File | null>(null)
  const [, setLocation] = useLocation()

  // const [createPaymentEvents] = useCreatePaymentEventsFromTransactionsMutation()
  const [createBankStatement] = useCreateBankStatementMutation()
  const { data: payments } = useGetPaymentsByReferenceNumbersQuery(received.filter(r => r.reference).map(r => r.reference.replace(/^0+/, '')))

  const handleFileChange = async (evt: React.ChangeEvent<HTMLInputElement>) => {
    setStatementFile(evt.target.files[0]);

    const e = evt.target.files[0];
    const content = await e.text();

    const statement = parseCAMT(content)
    setStatement(statement)

    setReceived(statement.entries.filter(d => d.type === 'credit'))
  }

  const rows: Array<StatementEntry & { payment?: Payment }> = useMemo(() => {
    if (!payments) {
      return received;
    }

    return received.map((tx) => ({
      ...tx,
      payment: payments.find(p => p.data.reference_number === tx.reference?.replace?.(/^0+/, '')),
    }));
  }, [payments, received])

  const handleImport = () => {
    if (statementFile) {
      createBankStatement(statementFile);
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
        <Button onClick={handleImport}>Upload</Button>
      </div>

      {statement && (
        <table className="my-10">
          <tr>
            <th className="text-left pr-2">Account:</th><td>{statement?.account?.iban}</td>
          </tr>
          <tr>
            <th className="text-left pr-2">Servicer:</th><td>{statement?.servicer?.name} ({statement?.servicer?.bic})</td>
          </tr>
          <tr>
            <th className="text-left pr-2">Statement generated at:</th><td>{statement && format(statement.creationDateTime, 'dd.MM.yyyy hh:mm')}</td>
          </tr>
          <tr>
            <th className="text-left pr-2">Opening balance:</th><td>{statement && formatEuro(statement.openingBalance.amount)} ({statement && format(statement.openingBalance.date, 'dd.MM.yyyy')})</td>
          </tr>
          <tr>
            <th className="text-left pr-2">Closing balance:</th><td>{statement && formatEuro(statement.closingBalance.amount)} ({statement && format(statement.closingBalance.date, 'dd.MM.yyyy')})</td>
          </tr>
        </table>
      )}

      <div>
        <TableView
          rows={rows.map(tx => ({ ...tx, key: tx.id }))}
          selectable
          actions={[
            {
              key: 'import',
              text: 'Import',
              disabled: (tx) => !tx.reference || (tx.payment && tx.payment.events.find(e => e.data?.accounting_id === tx.id)),
              onSelect: async (txs) => {
                await importBankTransactions(txs.map(tx => ({
                  accountingId: tx.id,
                  referenceNumber: tx.reference,
                  amount: tx.amount,
                  time: tx.valueDate.toString(),
                })))
              },
            }
          ]}
          columns={[
            { name: 'Date', getValue: 'valueDate', render: (date) => format(date, 'dd.MM.yyyy') },
            { name: 'Name', getValue: (tx) => tx.otherParty.name },
            { name: 'Amount', getValue: (row) => row.amount.value, render: (value) => formatEuro(cents(value)), align: 'right' },
            { name: 'Reference', align: 'right', getValue: (tx) => tx.reference?.replace?.(/^0+/, '') },
            { name: 'Message', getValue: (tx) => tx.message },
            { name: 'New', getValue: (tx) => tx.payment && tx.payment.events.find(e => e.data?.accounting_id === tx.id) ? 'No' : 'Yes' },
            {
              name: 'Payment',
              getValue: (row) => row.payment?.payment_number,
              render: (_, row) => {
                if (!row.payment)
                  return null;

                return (
                  <div
                    className="flex items-center cursor-pointer gap-1"
                    onClick={() => setLocation(`/admin/payments/${row.payment.id}`)}
                  >
                    {row.payment.payment_number}
                    <ExternalLink className="h-4 text-blue-500 relative" />
                  </div>
                )
              },
            },
            {
              name: 'Correct',
              getValue: (row) => row.payment
                ? (parseInt('' + row.payment.balance) + row.amount.value === 0 ? 'Yes' : 'No')
                : '-'// ? 'Yes' : 'No',
            },
          ]}
        />
      </div>
    </div>
  );
};
