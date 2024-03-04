import { useEffect, useRef, useState } from 'react';
import { useTable } from './context';
import { StatusIndicator } from './status-indicator';

export const CellContent = ({
  columnKey,
  rowKey,
}: {
  columnKey: string;
  rowKey: string;
}) => {
  const { dispatch, props, useCellState, useRowState, useColumnState } =
    useTable();
  const cell = useCellState(rowKey, columnKey);
  const row = useRowState(rowKey);
  const column = useColumnState(columnKey);

  if (!column || !row) {
    return null;
  }

  const columnType = props.columnTypes.find(ct => ct.key === column.type);

  const handleChange = async (evt: any) => {
    if (evt.target.value !== cell.value) {
      dispatch({
        type: 'SET_CELL_VALUE',
        payload: {
          row: row.key,
          column: column.key,
          value: evt.target.value,
        },
      });
    }
  };

  const [focus, setFocus] = useState(false);

  const [internalValue, setInternalValue] = useState(cell.value);

  useEffect(() => setInternalValue(cell.value), [cell.value]);
  const inputRef = useRef<HTMLInputElement>();

  const Input = columnType?.input ?? 'input';

  return (
    <td
      onClick={() => {
        setFocus(true);
        inputRef.current?.focus?.();
      }}
      tabIndex={0}
    >
      <Input
        ref={inputRef}
        value={internalValue}
        disabled={row.locked}
        onChange={(evt: any) => setInternalValue(evt.target.value)}
        onBlur={(evt: any) => {
          handleChange(evt);
          setFocus(false);
        }}
        style={{ textAlign: columnType?.align ?? 'left' }}
        placeholder={column.default}
      />
      {columnType?.render && !focus && (
        <div
          className="cell-overlay-content"
          style={{ pointerEvents: columnType?.readOnly ? 'all' : 'none' }}
        >
          {columnType.render(cell.value)}
        </div>
      )}
      {cell.annotations.size > 0 && (
        <div
          className="icon"
          style={
            columnType?.align === 'right'
              ? { left: '-0.2em' }
              : { right: '-0.2em' }
          }
        >
          <StatusIndicator annotations={cell.annotations} />
        </div>
      )}
    </td>
  );
};
