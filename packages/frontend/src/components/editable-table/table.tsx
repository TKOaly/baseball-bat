import { forwardRef, memo, useEffect, useImperativeHandle } from 'react';
import { parse } from 'papaparse';
import { AnnotationType } from './state';
import { RowHandle, createRowHandle } from './row-handle';
import { TableProvider, useTable } from './context';
import { useDialog } from '../dialog';
import { DetectHeadersDialog } from '../dialogs/detect-headers-dialog';
import { PlusSquare } from 'react-feather';
import styled from 'styled-components';
import { ColumnDefaultHeader, ColumnHeader } from './header';
import { DataRow } from './row';

export type ValidationResult =
  | { type: Omit<AnnotationType, 'loading'>; message: string }
  | string
  | null;

export type ColumnType = {
  key: string;
  label: string;
  aliases?: string[];
  validate?: (
    value: string,
    row: RowHandle,
  ) => Promise<ValidationResult> | ValidationResult;
  input?: any;
  align?: 'left' | 'right';
  readOnly?: boolean;
  allowSelection?: boolean;
  onSelect?: () => Promise<string | null | undefined>;
  render?: (value: string) => React.ReactNode;
};

export type RowAction = {
  key: string;
  label: string;
  execute: (row: RowHandle) => void;
};

export type RowValidationError = string | { column: string; message: string };

export type Props = {
  columnTypes: ColumnType[];
  initialData?: string[][];
  rowActions: Array<RowAction>;
  validateRow: (
    row: RowHandle,
  ) => RowValidationError[] | Promise<RowValidationError[]>;
};

export interface TableRef {
  getRow(key: string): RowHandle;
  setData(data: string[][]): void;
  getRowIterator(): Iterable<RowHandle>;
}

export const EditableTableInner = forwardRef((props: Props, ref) => {
  const { state, dispatch, useColumnOrder, useRowOrder } = useTable();
  const columns = useColumnOrder();
  const rows = useRowOrder();
  const showHeadersDetectedDialog = useDialog(DetectHeadersDialog);

  useEffect(() => {
    if (props.initialData) {
      dispatch({
        type: 'CLEAR_CELLS',
        payload: undefined as void,
      });

      props.initialData
        .flatMap((row, i) =>
          row.map((cell, j) => [i, j, cell] as [number, number, string]),
        )
        .forEach(([row, column, value]) =>
          dispatch({
            type: 'SET_CELL_VALUE',
            payload: { row, column, value },
          }),
        );
    }
  }, [props.initialData]);

  const handleAppendNewColumn = () =>
    dispatch({
      type: 'APPEND_NEW_COLUMN',
      payload: {},
    });

  const handleAppendNewRow = () =>
    dispatch({
      type: 'APPEND_ROW',
      payload: {},
    });

  useImperativeHandle(
    ref,
    (): TableRef => {
      return {
        getRow: (key: string) => createRowHandle(state, dispatch, key),
        setData: (data: string[][]) => {
          dispatch({
            type: 'CLEAR_CELLS',
            payload: undefined as void,
          });

          data
            .flatMap((row, i) =>
              row.map((cell, j) => [i, j, cell] as [number, number, string]),
            )
            .forEach(([row, column, value]) =>
              dispatch({
                type: 'SET_CELL_VALUE',
                payload: { row, column, value },
              }),
            );
        },
        getRowIterator: () => {
          const iterator = {
            rows: [...state.data.keys()],

            index: 0,

            next(): IteratorResult<RowHandle> {
              const i = this.index;

              if (i >= this.rows.length) {
                return { done: true, value: undefined };
              }

              this.index += 1;

              return {
                done: false,
                value: createRowHandle(state, dispatch, this.rows[i]),
              };
            },

            [Symbol.iterator]() {
              return this;
            },
          };

          return iterator;
        },
      };
    },
    [],
  );

  const setContentFromCsv = async (data: string) => {
    let parsed: string[][];

    try {
      parsed = parse(data).data as string[][];
    } catch (err) {
      parsed = [[data]];
    }

    const lastRow = parsed[parsed.length - 1];

    if (lastRow.every(value => value === '')) {
      parsed.pop();
    }

    const firstRow = parsed[0];
    const columnAliases = new Map(
      props.columnTypes.flatMap(ct =>
        [ct.label, ct.key, ...(ct.aliases ?? [])].map(alias => [
          alias.toLowerCase(),
          ct.key,
        ]),
      ),
    );

    if (firstRow.some(value => columnAliases.has(value.toLowerCase()))) {
      const result = await showHeadersDetectedDialog({
        headers: firstRow.filter(value =>
          columnAliases.has(value.toLowerCase()),
        ),
      });

      if (result) {
        parsed.splice(0, 1);
      }
    }

    const startRow = 0;
    const startColumn = 0;

    for (let row = startRow; row < startRow + parsed.length; row++) {
      for (
        let column = startColumn;
        column < startColumn + parsed[row - startRow].length;
        column++
      ) {
        dispatch({
          type: 'SET_CELL_VALUE',
          payload: {
            row,
            column,
            value: parsed[row - startRow][column - startColumn],
          },
        });
      }
    }

    firstRow.forEach((header, column) => {
      const type = columnAliases.get(header.toLowerCase());

      if (type) {
        dispatch({
          type: 'SET_COLUMN_TYPE',
          payload: {
            column,
            type,
          },
        });
      }
    });
  };

  const handleFileDrop = async (
    evt: React.MouseEvent<any> & { dataTransfer: DataTransfer },
  ) => {
    evt.preventDefault();

    const [file]: File[] = [...evt.dataTransfer.files];
    const data = await file.text();
    setContentFromCsv(data);
  };

  const handleFileUpload = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.click();

    input.addEventListener('change', (evt: any) => {
      const file = evt.target.files[0];
      const reader = new FileReader();

      reader.onload = (evt: any) => {
        setContentFromCsv(evt.target.result);
      };

      reader.readAsText(file);
    });
  };

  return (
    <EditableTableWrapper
      onDrop={handleFileDrop}
      onDragOver={evt => evt.preventDefault()}
      onDragEnter={evt => evt.preventDefault()}
    >
      <div>
        <div className="inline-flex flex-col">
          <table>
            <tr>
              <th colSpan={3} rowSpan={2} />
              {columns.map(key => (
                <ColumnHeader key={key} columnKey={key} />
              ))}
            </tr>
            <tr>
              {columns.map(key => (
                <ColumnDefaultHeader key={key} columnKey={key} />
              ))}
            </tr>
            {rows.map(key => (
              <DataRow key={key} rowKey={key} />
            ))}
          </table>
          <div
            className="flex p-3 text-gray-500 text-sm items-center gap-1 cursor-pointer"
            onClick={handleAppendNewRow}
          >
            <PlusSquare />
            Add row
          </div>
        </div>
        <div className="table-right-content flex flex-col grow">
          <div
            className="new-column-action cursor-pointer"
            onClick={handleAppendNewColumn}
          >
            <PlusSquare />
            Add column
          </div>
          <div className="text-gray-500 text-sm p-5 self-center">
            Drag and drop CSV files here <br /> or{' '}
            <button
              onClick={handleFileUpload}
              className="underline font-semibold"
            >
              upload one by clicking here
            </button>
            .
          </div>
        </div>
      </div>
    </EditableTableWrapper>
  );
});

const EditableTableWrapper = styled.div`
  overflow-x: scroll;
  margin: 2em 0;
  font-variant-numeric: tabular-nums;
  overflow: auto;
  background: hsl(0, 0%, 99%);
  border-left: 1px solid hsl(0, 0%, 90%);
  border-right: 1px solid hsl(0, 0%, 90%);
  box-shadow:
    0px 1px 0px 0px hsl(0, 0%, 90%) inset,
    0px -1px 0px 0px hsl(0, 0%, 90%) inset;

  & > div {
    display: flex;
    align-items: flex-start;

    .table-right-content {
      padding: 0.5rem;
      white-space: nowrap;

      .new-column-action {
        margin: 0.2em 0.2em;
        flex-shrink: 0;
        color: #4b5563;
        padding: 0.1em;
        border-radius: 0.3em;
        cursor: pointer;
        align-self: flex-start;
        display: flex;
        font-size: 0.9em;
        align-items: center;
        gap: 0.3em;

        svg {
          height: 1.4rem;
          width: 1.4rem;
        }

        &:hover {
          background: rgba(0, 0, 0, 0.05);
        }
      }
    }

    table {
      flex-shrink: 0;
      width: max-content;
      font-size: 11pt;
      background: white;
      margin: 0 -1px;

      .row-menu > div {
        display: flex;
        align-items: center;
        margin-left: 0.2em;
      }

      .row-number {
        text-align: right;
        color: #545e6b;
      }

      tr:first-child > th {
        width: 100px;
      }

      th {
        background: hsl(0, 0%, 98%);
        font-weight: 500;
        color: hsl(0, 0%, 20%);
      }

      th,
      td {
        border: 1px solid hsl(0, 0%, 90%);
        padding: 3px 0.5em;
        text-align: left;
        background-clip: padding-box !important;
        position: relative;
        white-space: nowrap;
      }

      tr.locked td {
        background-color: rgba(0, 0, 0, 0.025);
        cursor: not-allowed;

        .cell-overlay-content {
          background-color: #fafafa;
        }
      }

      td > input {
        width: 100%;

        &:focus {
          outline: none;
        }

        &[disabled] {
          background: transparent;
          color: rgba(0, 0, 0, 0.6);
        }
      }

      td input {
        cursor: default;
      }

      td.selected input {
        cursor: auto;
      }

      td.has-error,
      td.selected {
        &::after {
          position: absolute;
          inset: -1px;
          border-width: 2px;
          border-style: solid;
          border-radius: 3px;
          content: '';
          pointer-events: none;
        }
      }

      td.has-error::after {
        border-color: rgb(240, 82, 82);
      }

      td.selected,
      td.selected input {
        background-color: #eff6ff;
      }

      td.selected::after {
        border-color: #3f83f8;
      }

      td .icon {
        position: absolute;
        margin: 0 0.4em;
        top: 0;
        height: 100%;
        display: flex;
        align-items: center;
        background-color: white;
        border-radius: 4px;
        padding: 2px;
      }

      td {
        input {
          padding: 0;
          border: none;
          font-size: 1em;

          &:focus {
            outline: none;
            border: none;
            box-shadow: none;
          }
        }

        .cell-overlay-content {
          background: white;
          padding: 3px 0.5em;
          position: absolute;
          inset: 0;
          overflow: hidden;
        }
      }

      tr > th:first-child {
        text-align: right;
      }

      .resize-handle {
        background: #fafafa;
        user-select: none;
      }

      .resize-handle::after {
        content: '';
        top: 0;
        position: absolute;
        bottom: 0;
        left: -2px;
        width: 4px;
        z-index: 10;
        cursor: col-resize;
        user-select: none;
      }

      .resize-handle:hover::after {
        background-color: #e6e6e6;
      }
    }
  }
`;

EditableTableInner.displayName = 'EditableTableInner';

export const EditableTable = memo(
  forwardRef((props: Props, ref) => {
    return (
      <TableProvider {...props}>
        <EditableTableInner ref={ref} {...props} />
      </TableProvider>
    );
  }),
);
