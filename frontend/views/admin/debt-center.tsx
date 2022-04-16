import { Breadcrumbs } from '../../components/breadcrumbs'
import { useGetDebtCenterQuery } from '../../api/debt-centers'
import { ListView } from '../../components/list-view';
import { Link, useLocation } from 'wouter';
import { TableView } from '../../components/table-view'
import { tw } from '../../tailwind'
import { TabularFieldList } from '../../components/tabular-field-list';
import { TextField } from '../../components/text-field';
import { EuroField } from '../../components/euro-field';
import { useGetDebtComponentsByCenterQuery, useGetDebtsByCenterQuery, usePublishDebtsMutation } from '../../api/debt';
import { Circle, ExternalLink, MoreVertical, Square, TrendingDown, TrendingUp } from 'react-feather';
import { useState } from 'react';
import { FilledDisc } from '../../components/filled-disc';
import { setSeconds } from 'date-fns';
import { Dropdown } from '../../components/dropdown';
import { formatEuro } from '../../../common/currency';

const StyledButton = tw.button`
  bg-gradient-to-br
  from-green-300
  to-green-400
  px-3
  py-1.5
  rounded-md
  text-black
  text-sm
`;

const Button = ({ children, ...rest }) => (
  <StyledButton {...rest}>{children}</StyledButton>
);

export const DebtCenterDetails = ({ id }) => {
  const [] = useLocation()
  const { data: debtCenter, isLoading } = useGetDebtCenterQuery(id)
  const { data: components } = useGetDebtComponentsByCenterQuery(id)
  const { data: debts } = useGetDebtsByCenterQuery(id)
  const [publishDebts] = usePublishDebtsMutation()

  if (isLoading || !debtCenter) {
    return (
      <div>
        Loading....
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl mb-5 mt-10">
        <Breadcrumbs
          segments={[
            { text: 'Debt Centers', url: '/admin' },
            debtCenter.name,
          ]}
        />
      </h1>
      <div className="grid grid-cols-2 gap-x-8">
        <div className="my-4">
          <div className="text-gray-500 text-xs font-bold uppercase">Name</div>
          <div className="mt-1">{debtCenter.name}</div>
        </div>
        <div className="my-4">
          <div className="text-gray-500 text-xs font-bold uppercase mb-1">URL</div>
          <div className="mt-1 bg-gray-200 font-bold inline-block px-2 py-0.5 rounded-sm text-gray-500 text-xs">No value</div>
          {/*<div className="rounded-md bg-gray-50 mt-2 py-2 px-3 min-h-[40px]">{debtCenter.url}</div>*/}
        </div>
        <div className="my-4 col-span-full">
          <div className="text-gray-500 text-xs font-bold uppercase">Description</div>
          <div className="rounded-md bg-gray-50 h-10 mt-2 py-2 px-3 min-h-[40px]">{debtCenter.description}</div>
        </div>
        <div className="col-span-full border-b mt-4 pb-2 uppercase text-xs font-bold text-gray-400 px-1">
          Debt components
        </div>
        <div className="col-span-full mt-4">
          <TableView
            rows={(components ?? [])}
            columns={[
              { name: 'Name', getValue: 'name' },
              {
                name: 'Amount',
                getValue: (row) => row.amount.value,
                render: (_value, row) => <div className="align-self-end">{formatEuro(row.amount)}</div>,
                align: 'right',
              },
              {
                name: 'Description',
                getValue: 'description',
              },
            ]}
            onRowClick={() => { }}
          />
        </div>
        <div className="col-span-full border-b mt-8 pb-2 uppercase text-xs font-bold text-gray-400 px-1">
          Assigned debts
        </div>
        <div className="my-4 col-span-full">
          <TableView
            onRowClick={() => { }}
            selectable
            rows={(debts ?? []).map(d => ({ ...d, key: d.id })) ?? []}
            columns={[
              { name: 'Name', getValue: 'name' },
              {
                name: 'Payer',
                getValue: (row) => row.payer.name,
                render: (_value, row) => (
                  <Link onClick={(e) => e.stopPropagation()} to={`/admin/payers/${row.payer.id.value}`} className="flex gap-1 items-center">{row.payer.name} <ExternalLink className="text-blue-500 h-4" /></Link>
                ),
              },
              {
                name: 'Status',
                getValue: (row) => row.draft ? 'Draft' : 'Unpaid',
                render: (value) => {
                  return {
                    'Draft': <span className="py-0.5 px-1.5 rounded-[2pt] bg-blue-500 text-xs font-bold text-white">Draft</span>,
                    'Unpaid': <span className="py-0.5 px-1.5 rounded-[2pt] bg-gray-300 text-xs font-bold text-gray-600">Unpaid</span>,
                    'Paid': <span className="py-0.5 px-1.5 rounded-[2pt] bg-green-500 text-xs font-bold text-white">Paid</span>,
                  }[value]
                },
              },
              {
                name: 'Labels',
                getValue: () => null,
                render: () => (
                  <>
                    {Math.random() > 0.5 && <span className="py-0.5 px-1.5 rounded-[2pt] bg-gray-300 text-xs font-bold text-gray-600 mr-2">External</span>}
                    {Math.random() > 0.5 && <span className="py-0.5 px-1.5 rounded-[2pt] bg-gray-300 text-xs font-bold text-gray-600">Manual</span>}
                  </>
                ),
              }
            ]}
            actions={[
              {
                key: 'delete',
                text: 'Delete',
                disabled: (row) => row.payer.name.indexOf('Juho') > -1,
                onSelect: () => { },
              },
              {
                key: 'publish',
                text: 'Publish',
                onSelect: async (rows) => {
                  await publishDebts(rows.map(r => r.id))
                },
              }
            ]}
          />
        </div>
      </div>
    </div>
  );
};
