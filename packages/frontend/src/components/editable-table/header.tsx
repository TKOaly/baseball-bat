import { useRef, MouseEventHandler, useState } from 'react';
import { useTable } from './context';
import { Dropdown } from '@bbat/ui/src/dropdown';
import { ColumnType } from './table';
import { MoreVertical } from 'react-feather';

export const ColumnHeader = ({ columnKey: key }: { columnKey: string }) => {
  const { dispatch, props, state, useColumnState, useRowOrder } = useTable();
  const column = useColumnState(key);
  const rows = useRowOrder();
  const ref = useRef<HTMLTableCellElement>(null);

  if (!column) {
    return null;
  }

  const handleColumnTypeChange = (column: string, type: string) =>
    dispatch({
      type: 'SET_COLUMN_TYPE',
      payload: { column, type },
    });

  const handleMouseDown: MouseEventHandler = evt => {
    if (!ref.current) {
      return;
    }

    const startX = evt.screenX;
    const startWidth = ref.current.getClientRects()[0].width;

    const onMouseMove = (evt: MouseEvent) => {
      if (ref.current) {
        ref.current.style.width = evt.screenX - startX + startWidth + 'px';
      }
    };

    document.addEventListener('mouseup', () => {
      document.removeEventListener('mousemove', onMouseMove);
    });

    document.addEventListener('mousemove', onMouseMove);
  };

  const handleSize = () => {
    if (!ref.current) {
      return;
    }

    let maxWidth = 0;

    for (const row of state.data.values()) {
      const cell = row.cells.get(column.key);

      if (!cell) {
        throw new Error('Row column iteratin failed!');
      }

      const value = cell.value;
      const span = document.createElement('span');
      span.innerText = value;
      document.body.appendChild(span);
      const [{ width }] = span.getClientRects();
      document.body.removeChild(span);

      maxWidth = Math.max(maxWidth, width);
    }

    ref.current.style.width = `${maxWidth + 10}px`;
  };

  const handleRemoveColumn = () => {
    dispatch({
      type: 'REMOVE_COLUMN',
      payload: {
        column: column.key,
      },
    });
  };

  return (
    <>
      <th ref={ref} onDoubleClick={handleSize}>
        <div className="flex items-center">
          <Dropdown
            label={
              props.columnTypes.find((c: ColumnType) => c.key === column.type)
                ?.label ?? 'No type'
            }
            options={props.columnTypes
              .filter((ct: ColumnType) => ct.allowSelection !== false)
              .map((columnType: ColumnType) => ({
                value: columnType.key,
                text: columnType.label,
              }))}
            onSelect={type => handleColumnTypeChange(key, type)}
          />
          <div className="grow" />
          <Dropdown
            className="flex"
            renderTrigger={props => (
              <button {...props}>
                <MoreVertical style={{ width: '1.2em' }} />
              </button>
            )}
            showArrow={false}
            options={[
              { text: 'Fit to content', onSelect: handleSize },
              { text: 'Remove column', onSelect: handleRemoveColumn },
            ]}
          />
        </div>
      </th>
      <th
        rowSpan={rows.length + 2}
        style={{ width: 0, padding: 0, borderLeft: 'hidden' }}
        className="resize-handle"
        onMouseDown={handleMouseDown}
      ></th>
    </>
  );
};

export const ColumnDefaultHeader = ({ columnKey }: { columnKey: string }) => {
  const { dispatch, useColumnState } = useTable();
  const column = useColumnState(columnKey);
  const [value, setValue] = useState(column?.default ?? '');

  return (
    <th className="!text-gray-700">
      <input
        placeholder="No default"
        value={value}
        className="w-full bg-transparent !text-[inherit]"
        onChange={evt => {
          setValue(evt.currentTarget.value);
        }}
        onBlur={() => {
          dispatch({
            type: 'SET_COLUMN_DEFAULT',
            payload: {
              column: columnKey,
              value,
            },
          });
        }}
      />
    </th>
  );
};
