import { useEffect, useMemo, useState } from 'react';
import { Breadcrumbs } from '../../components/breadcrumbs';
import { TabularFieldList } from '../../components/tabular-field-list';
import { EuroField } from '../../components/euro-field';
import { TextField } from '../../components/text-field';
import { useGetDebtCenterQuery } from '../../api/debt-centers';
import { useMassCreateDebtsMutation, useMassCreateDebtsProgressQuery } from '../../api/debt';
import { AlertTriangle, Edit, ExternalLink, Info } from 'react-feather';
import { Button } from '../../components/button';
import { parse } from 'papaparse';
import { cents, euro, formatEuro, sumEuroValues } from '../../../common/currency';
import { identity, omit } from 'remeda';
import { tw } from '../../tailwind';
import { addDays, format } from 'date-fns';
import { useDialog } from '../../components/dialog';
import { SetColumnDefaultValueDialog } from '../../components/dialogs/set-column-default-value-dialog';
import { skipToken } from '@reduxjs/toolkit/dist/query/react';
import { Progress } from '../../components/progress';

type ParsedRow = {
  tkoalyUserId?: number
  dueDate?: string
  date?: string
  email?: string
  name?: string
  description?: string
  amount?: number
  referenceNumber?: string
  components: Array<string>
}

const parseDate = (v: string) => v;

const parseEuros = (v: string) => {
  const [euros, centsPart] = v.replace(/€$/, '').trim().split(/[,.]/, 2);

  if (centsPart && centsPart.length > 2) {
    throw 'Only up to 2 decimal places allowed in the amount column.';
  }

  return cents(parseInt(euros) * 100 + (centsPart ? parseInt(centsPart) : 0));
};

const parseReferenceNumber = (v: string) => v;

// eslint-disable-next-line
const DebtStatusItem = ({ result, index }: { result: any, index: number }) => {
  return (
    <div className="rounded bg-white border shadow mb-2 p-2">
      <div className="flex">
        <div className="flex-grow">
          <div>
            <span className="text-sm text-gray-600 mr-2">Line #{index}</span>
            {result?.debt?.name}
          </div>
          <div className="text-sm">
            <span className="font-bold text-gray-500">Payer:</span> {result.payer?.id?.value ? <span className="inline-flex results-center">{result.payer.name} <ExternalLink className="h-4 text-blue-500" /></span> : <span>{result.payer?.name ? `${result.payer.name} (Profile not found)` : 'Unknown Name'}</span>} <br />
            <span className="font-bold text-gray-500">Email:</span> {result.email} ({result.emailSource}) <br />
            <span className="font-bold text-gray-500">Center:</span> {result.debtCenter?.name} ({result.debtCenter?.id?.value === '' ? 'New' : 'Existing'})<br />
          </div>
          {result.components?.length > 0 && (
            <ul>
              {result.components.filter(({ id }) => id !== '8d12e7ef-51db-465e-a5fa-b01cf01db5a8').map(({ id, name, amount }) => <li key={id} className="inline-block mr-1 text-sm"><span className="text-white bg-gray-400 rounded px-1 inline-block">{name} ({formatEuro(amount)})</span></li>)}
            </ul>
          )}
        </div>
        <div>
          {result?.components?.length > 0 ? formatEuro(result.components.map(c => c.amount).reduce(sumEuroValues)) : '0,00 €'}
        </div>
      </div>
      {result.payer?.id?.value === '' && (
        <div className="rounded border mt-1 flex items-center p-2 gap-2 text-yellow-800 text-sm shadow border-yellow-300 bg-yellow-100">
          <Info className="text-yellow-400" />
          Payer profile will be created based on {result.payer.tkoalyUserId === undefined ? 'provided e-mail and name' : 'membership details'}.
        </div>
      )}
      {!result.payer && (
        <div className="rounded border flex mt-1 items-center p-2 gap-2 text-red-800 text-sm shadow border-red-300 bg-red-100">
          <AlertTriangle className="text-red-400" />
          Payer profile not found and sufficient information for it{'\''}s creation is not available.
        </div>
      )}
    </div>
  );
};

const parseCsv = (csv: string): Array<ParsedRow> => {
  const { data } = parse(csv);
  const [header, ...rows] = data as Array<Array<string>>;

  if (!header) {
    return [];
  }

  const columnMapping = {
    'member id': ['tkoalyUserId', parseInt],
    'due date': ['dueDate', parseDate],
    'date': ['date', parseDate],
    'debt center': 'debtCenter',
    'email': 'email',
    'payment number': 'paymentNumber',
    'name': 'name',
    'payer name': 'name',
    'title': 'title',
    'description': 'description',
    'amount': ['amount', parseEuros],
    'reference number': ['referenceNumber', parseReferenceNumber],
  };

  const columns = header.map((title: string) => {
    const normalized = title.toLowerCase().trim();
    const column = columnMapping[normalized];

    if (column) {
      const [key, parser] = typeof column === 'string'
        ? [column, (i) => i]
        : column;

      return { type: 'standard', key, parser };
    } else {
      return { type: 'component', name: title };
    }
  });

  return rows.map(row => row.reduce((acc, value, i) => {
    const column = columns[i];

    if (column.type === 'standard') {
      try {
        acc[column.key] = column.parser(value.trim());
      } catch {
        acc[column.key] = null;
      }
    } else if (value.trim().toLowerCase() === 'true') {
      acc.components.push(header[i]);
    }

    return acc;
  }, { components: [] }));
};

const TableHeader = tw.th`
  px-2
  py-2
  text-left
`;

const TableCell = tw.td`
  px-2
  py-2
  text-left
  border-t
  border-r
  last:border-r-none
`;

export const MassCreateDebts = ({ params, defaults: pDefaults }) => {
  const debtCenterId = params.id;

  const [progressId, setProgressId] = useState(null);
  const { data: debtCenter } = useGetDebtCenterQuery(debtCenterId);
  const [massCreateDebtsMutation] = useMassCreateDebtsMutation();
  const { data: progress } = useMassCreateDebtsProgressQuery(progressId ?? skipToken, { pollingInterval: 200 });
  const [csvData, setCsvData] = useState('');
  const showSetColumnDefaultValueDialog = useDialog(SetColumnDefaultValueDialog);
  const [state, setState] = useState<'idle' | 'dry-run' | 'run'>('idle');

  useEffect(() => {
    if (!progress)
      return;

    if (progress.result) {
      setState('idle');
      setProgressId(null);
    }
  }, [progress]);

  const parsedCsv = useMemo(() => {
    try {
      return parseCsv(csvData);
    } catch (e) {
      return [];
    }
  }, [csvData]);

  const [components, setComponents] = useState([]);

  const [defaultOverrides, setDefaultOverrides] = useState({});

  const defaults = useMemo(() => {
    return {
      dueDate: format(addDays(new Date(), 31), 'dd.MM.yyyy'),
      ...pDefaults,
      ...defaultOverrides,
    };
  }, [pDefaults, defaultOverrides]);

  useEffect(() => {
    const newComponents = [...components]
      .filter(({ name }) => parsedCsv.some(r => r.components.indexOf(name) > -1));

    parsedCsv
      .flatMap(r => r.components)
      .forEach((c1) => {
        if (newComponents.findIndex(c2 => c2.name === c1) === -1) {
          newComponents.push({ name: c1, amount: 0, isNew: true });
        }
      });

    setComponents(newComponents);
  }, [parsedCsv]);

  const submit = async (dryRun: boolean) => {
    setState(dryRun ? 'dry-run' : 'run');

    const result = await massCreateDebtsMutation({
      defaults,
      debts: parsedCsv,
      dryRun,
      components: components.filter(c => c.isNew).map(c => ({ ...omit(c, ['isNew', 'amount']), amount: euro(c.amount) })),
    });

    if ('data' in result) {
      setProgressId(result.data.progress);
    } else {
      setState('idle');
    }
  };

  const makeDefaultValueCell = <K extends keyof typeof defaults, V>(
    key: string,
    title: string,
    inputComponent: any = TextField, // eslint-disable-line
    format: ((v: (typeof defaults)[K]) => string) = identity,
    map: ((v: V) => (typeof defaults)[K]) = identity,
  ) => {
    return (
      <div className="flex items-center">
        {defaults[key] ? format(defaults[key]) : <span className="text-gray-500 italic">Empty</span>}
        <Edit className="text-gray-500 ml-1.5 h-4 w-4 cursor-pointer" onClick={async () => {
          const { changed, value } = await showSetColumnDefaultValueDialog({
            columnKey: key,
            columnTitle: title,
            value: defaults[key],
            inputComponent,
          });

          if (changed) {
            setDefaultOverrides((overrides) => Object.assign({}, overrides, { [key]: map(value as V) }));
          }
        }} />
      </div>
    );
  };

  return (
    <div>
      <h1 className="text-2xl mt-10 mb-5">
        <Breadcrumbs
          segments={[
            {
              text: 'Debt Centers',
              url: '/admin/debt-centers',
            },
            {
              text: debtCenter?.name ?? '...',
              url: `/admin/debt-centers/${debtCenterId}`,
            },
            'Mass Create Debts',
          ]}
        />
      </h1>
      <p>
        Paste CSV to the text box below with the following columns:
        <table className="rounded shadow border bg-white text-sm my-5">
          <tr>
            <TableHeader>Column Header</TableHeader>
            <TableHeader>Description</TableHeader>
            <TableHeader>Required?</TableHeader>
            <TableHeader>Default</TableHeader>
          </tr>
          <tr>
            <TableCell className="whitespace-nowrap">Member ID</TableCell>
            <TableCell>TKO-äly member account ID</TableCell>
            <TableCell rowSpan={2}>At least one must be defined</TableCell>
            <TableCell>
              {makeDefaultValueCell('tkoalyUserId', 'Member ID')}
            </TableCell>
          </tr>
          <tr>
            <TableCell className="whitespace-nowrap">Email</TableCell>
            <TableCell>Recipient email</TableCell>
            <TableCell>
              {makeDefaultValueCell('email', 'Email')}
            </TableCell>
          </tr>
          <tr>
            <TableCell className="whitespace-nowrap">Debt Center ID</TableCell>
            <TableCell>Name or ID of the debt center which will contain the created debts. If a name is specified and no such debt center exists, a new one is created.</TableCell>
            <TableCell>Required</TableCell>
            <TableCell>
              {makeDefaultValueCell('debtCenter', 'Debt Center')}
            </TableCell>
          </tr>
          <tr>
            <TableCell className="whitespace-nowrap">Payer Name</TableCell>
            <TableCell>Name of the payer. Used in case no payer profile exists for the payer.</TableCell>
            <TableCell>Required in case a payer profile must be created and no name for the payer is known. Eg. for non-member payers.</TableCell>
            <TableCell>
              {makeDefaultValueCell('name', 'Payer Name')}
            </TableCell>
          </tr>
          <tr>
            <TableCell className="whitespace-nowrap">Amount</TableCell>
            <TableCell>Base amount of the debt in euros excluding any additional debt components</TableCell>
            <TableCell>Required</TableCell>
            <TableCell>
              {makeDefaultValueCell('amount', 'Amount', EuroField, formatEuro, euro)}
            </TableCell>
          </tr>
          <tr>
            <TableCell className="whitespace-nowrap">Title</TableCell>
            <TableCell>Title for the debt</TableCell>
            <TableCell>Optional</TableCell>
            <TableCell>
              {makeDefaultValueCell('title', 'Title')}
            </TableCell>
          </tr>
          <tr>
            <TableCell className="whitespace-nowrap">Description</TableCell>
            <TableCell>Description for the debt</TableCell>
            <TableCell>Optional</TableCell>
            <TableCell>
              {makeDefaultValueCell('description', 'Description')}
            </TableCell>
          </tr>
          <tr>
            <TableCell className="whitespace-nowrap">Date</TableCell>
            <TableCell>Original publishing date of the debt</TableCell>
            <TableCell>Optional</TableCell>
            <TableCell>
              {makeDefaultValueCell('date', 'Date')}
            </TableCell>
          </tr>
          <tr>
            <TableCell className="whitespace-nowrap">Due Date</TableCell>
            <TableCell>Due date for the debt</TableCell>
            <TableCell>Optional</TableCell>
            <TableCell>
              {makeDefaultValueCell('dueDate', 'Due Date')}
            </TableCell>
          </tr>
          <tr>
            <TableCell className="whitespace-nowrap">Reference Number</TableCell>
            <TableCell>Reference number for the automatically created invoice</TableCell>
            <TableCell>Optional</TableCell>
            <TableCell>
              {makeDefaultValueCell('referenceNumber', 'Reference Number')}
            </TableCell>
          </tr>
          <tr>
            <TableCell className="whitespace-nowrap">Payment Number</TableCell>
            <TableCell>Identifier for the debt used in book-keeping.</TableCell>
            <TableCell>Optional</TableCell>
            <TableCell>
              {makeDefaultValueCell('paymentNumber', 'Payment Number')}
            </TableCell>
          </tr>
          <tr>
            <TableCell colSpan={4}>
              Any other columns are interpreted to represent debt components. Rows which contain {'"True"'} in such columns will result in a debt with that debt component. Prices for the debt components can be specified in the table below.
            </TableCell>
          </tr>
        </table>
        <div className="border-b mt-4 pb-2 uppercase text-xs font-bold text-gray-400 px-1">
          CSV
        </div>
        <textarea placeholder="Paste your CSV here" className="rounded border shadow w-full my-5 text-sm" onChange={(evt) => setCsvData(evt.target.value)}>{csvData}</textarea>
        {components?.length > 0 && (
          <>
            <div className="border-b pb-2 uppercase text-xs font-bold text-gray-400 px-1 mb-3">
              Debt Components
            </div>
            <TabularFieldList
              value={components}
              columns={[
                {
                  key: 'name',
                  header: 'Name',
                  component: TextField,
                  props: { readOnly: true },
                },
                {
                  key: 'amount',
                  header: 'Amount',
                  component: EuroField,
                },
                {
                  key: 'isNew',
                  getValue: (row) => row.isNew ? 'New' : 'Existing',
                  header: 'Status',
                  component: TextField,
                  props: { readOnly: true },
                },
              ]}
              createNew={() => ({})}
              onChange={setComponents}
            />
          </>
        )}
        <div>
          <Button secondary loading={state === 'dry-run'} className="mr-2" onClick={() => submit(true)}>Dry run</Button>
          <Button loading={state === 'run'} onClick={() => submit(false)}>Create debts</Button>
        </div>
        <div className="border-b mt-4 pb-2 uppercase text-xs font-bold text-gray-400 px-1 mb-3">
          Progress
        </div>
        <p>
          <Progress value={progress?.current ?? 0} max={progress?.total ?? 0} message={progress?.message} noText={!progress} />
        </p>
        <div className="border-b mt-4 pb-2 uppercase text-xs font-bold text-gray-400 px-1 mb-3">
          Results
        </div>
        <ul>
          {progress && !progress.result ? 'Loading...' : ''}
          {progress?.result && progress.result.map((row, i) => <DebtStatusItem result={row} index={i} key={i} />)}
        </ul>
      </p>
    </div>
  );
};
