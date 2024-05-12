import { Dropdown, DropdownItem } from '@bbat/ui/src/dropdown';
import { useTable } from './context';
import { MoreVertical, Lock } from 'react-feather';
import { RowAction } from './table';
import { StatusIndicator } from './status-indicator';
import { CellContent } from './cell';
import { createRowHandle } from './row-handle';

export const DataRow = ({ rowKey }: { rowKey: string }) => {
  const { dispatch, props, state, useRowState, useColumnOrder, useRowOrder } =
    useTable();
  const row = useRowState(rowKey);
  const columns = useColumnOrder();
  const rows = useRowOrder();

  const i = rows.indexOf(rowKey);

  const handleDeleteRow = (row: string) =>
    dispatch({
      type: 'DELETE_ROW',
      payload: { row },
    });

  const handleAddRowBelow = (row: string) =>
    dispatch({
      type: 'INSERT_ROW',
      payload: { row: row + 1 },
    });

  if (!row) {
    throw new Error('No such row!');
  }

  const isLoading = [...row.annotations.values()].some(
    a => a.type === 'loading',
  );

  return (
    <tr
      key={rowKey}
      data-loading={isLoading}
      className={row.locked ? 'locked' : ''}
    >
      <th
        style={{ borderRightColor: '#fafafa', padding: '0' }}
        className="row-menu"
      >
        <Dropdown
          flat
          showArrow={false}
          label={
            <MoreVertical
              style={{ width: '1.2em', color: 'rgba(0,0,0,0.5)' }}
            />
          }
        >
          <DropdownItem
            label="Delete row"
            onSelect={() => handleDeleteRow(row.key)}
          />
          <DropdownItem
            label="Add row below"
            onSelect={() => handleAddRowBelow(row.key)}
          />
          <DropdownItem
            label="Lock row"
            onSelect={() =>
              dispatch({
                type: 'SET_ROW_LOCK',
                payload: { row: row.key, locked: true },
              })
            }
          />
          {props.rowActions.map((action: RowAction) => (
            <DropdownItem
              label={action.label}
              onSelect={() => {
                -action.execute(createRowHandle(state, dispatch, row.key));
              }}
            />
          ))}
        </Dropdown>
      </th>
      <th style={{ padding: 0, borderRightColor: '#fafafa' }}>
        <div style={{ display: 'flex', gap: '0.5em' }}>
          {row.annotations.size > 0 && (
            <StatusIndicator annotations={row.annotations} />
          )}
          {row.locked && (
            <Lock style={{ width: '1em', color: 'rgba(0,0,0,0.5)' }} />
          )}
        </div>
      </th>
      <th className="row-number">{i + 1}</th>
      {columns.map(columnKey => (
        <CellContent key={columnKey} rowKey={rowKey} columnKey={columnKey} />
      ))}
    </tr>
  );
};
