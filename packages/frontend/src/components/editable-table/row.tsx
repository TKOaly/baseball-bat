import { Dropdown } from '@bbat/ui/src/dropdown';
import { useTable } from './context';
import { createRowHandle } from './row-handle';
import { MoreVertical, Lock } from 'react-feather';
import { RowAction } from './table';
import { StatusIndicator } from './status-indicator';
import { CellContent } from './cell';

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

  return (
    <tr key={rowKey} className={row.locked ? 'locked' : ''}>
      <th
        style={{ borderRightColor: '#fafafa', padding: '0' }}
        className="row-menu"
      >
        <Dropdown
          options={[
            { text: 'Delete row', onSelect: () => handleDeleteRow(row.key) },
            {
              text: 'Add row below',
              onSelect: () => handleAddRowBelow(row.key),
            },
            {
              text: 'Lock row',
              onSelect: () =>
                dispatch({
                  type: 'SET_ROW_LOCK',
                  payload: { row: row.key, locked: true },
                }),
            },
            ...props.rowActions.map((action: RowAction) => ({
              text: action.label,
              onSelect: () => {
                action.execute(createRowHandle(state, dispatch, row.key));
              },
            })),
          ]}
          showArrow={false}
          label={
            <MoreVertical
              style={{ width: '1.2em', color: 'rgba(0,0,0,0.5)' }}
            />
          }
        />
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
