import { PropsWithChildren, createContext, useContext, useEffect } from 'react';
import {
  Action,
  AnnotationType,
  CellState,
  ColumnState,
  RowState,
  TableStateHelpers,
  useTableState,
} from './state';
import { createInvalidableHook } from './invalidation';
import { createRowHandle } from './row-handle';
import { ColumnType, Props, ValidationResult } from './table';

type TableContextValue = {
  useRows: () => Iterable<RowState>;
  useColumns: () => Iterable<ColumnState>;
  useRowState: (rowKey: string) => RowState | undefined;
  subscribe: (
    tag: string,
    callback: (payload: unknown) => void,
    immediate?: boolean,
  ) => void;
  unsubscribe: (callback: (...args: any) => void) => void;
  useColumnState: (columnKey: string) => ColumnState | undefined;
  useCellState: (rowKey: string, columnKey: string) => CellState;
  useColumnOrder: () => Array<string>;
  useRowOrder: () => Array<string>;
  dispatch: (action: Action, payload?: unknown) => void;
  props: Props;
  state: TableStateHelpers;
};

export const TableContext = createContext<TableContextValue>({} as any);

export const TableProvider = ({
  children,
  ...props
}: PropsWithChildren<Props>) => {
  const { state, dispatch, subscribe, unsubscribe } = useTableState();

  console.log('STATE', state, state.rowOrder);

  const useCreateInvalidableHook = <A extends any[], T>(
    names: (...args: A) => string[],
    hook: (value: TableStateHelpers, ...args: A) => T,
  ) => {
    const invalidable = createInvalidableHook(names, (...args) =>
      hook(state, ...args),
    );

    return (...args: A) => invalidable({ subscribe, unsubscribe }, ...args);
  };

  useEffect(() => {
    subscribe(
      'row',
      async (row: string) => {
        if (props.validateRow) {
          const rowHandle = createRowHandle(state, dispatch, row);

          rowHandle.clearRowAnnotation({
            id: 'row-validation',
          });

          rowHandle.clearColumnAnnotation({
            id: 'row-validation',
          });

          rowHandle.setRowAnnotation({
            id: 'row-validation',
            type: 'loading',
            message: 'Validating...',
          });

          const errors = await props.validateRow(rowHandle);

          rowHandle.clearRowAnnotation({
            id: 'row-validation',
          });

          rowHandle.clearColumnAnnotation({
            id: 'row-validation',
          });

          for (const error of errors) {
            if (typeof error === 'string') {
              rowHandle.setRowAnnotation({
                id: 'row-validation',
                type: 'error',
                message: error,
              });
            } else {
              rowHandle.setColumnAnnotation({
                column: error.column,
                annotation: {
                  id: 'row-validation',
                  type: 'error',
                  message: error.message,
                },
              });
            }
          }
        }
      },
      true,
    );

    const validateCell = async ({
      row,
      column: columnKey,
    }: {
      row: string;
      column: string;
    }) => {
      const column = state.columns.get(columnKey);

      if (!column) {
        return;
      }

      const columnType = props.columnTypes.find(
        (ct: ColumnType) => ct.key === column.type,
      );

      const cell = state.getCell(row, column.key);

      const validate = columnType?.validate;

      if (validate) {
        const value = cell.value ?? column.default;

        dispatch({
          type: 'SET_CELL_ANNOTATION',
          payload: {
            row: row,
            column: column.key,
            id: 'validation',
            type: 'loading',
            message: 'Validating...',
          },
        });

        const error: ValidationResult = await new Promise(resolve => {
          setTimeout(
            () =>
              resolve(validate(value, createRowHandle(state, dispatch, row))),
            0,
          );
        });

        if (error) {
          if (typeof error === 'string') {
            dispatch({
              type: 'SET_CELL_ANNOTATION',
              payload: {
                row: row,
                column: column.key,
                id: 'validation',
                type: 'error',
                message: error,
              },
            });
          } else {
            dispatch({
              type: 'SET_CELL_ANNOTATION',
              payload: {
                row: row,
                column: column.key,
                id: 'validation',
                type: error.type as AnnotationType,
                message: error.message,
              },
            });
          }
        } else {
          dispatch({
            type: 'CLEAR_CELL_ANNOTATION',
            payload: {
              row: row,
              column: column.key,
              id: 'validation',
            },
          });
        }
      } else if (cell.annotations.has('validation')) {
        dispatch({
          type: 'CLEAR_CELL_ANNOTATION',
          payload: { row: row, column: column.key, id: 'validation' },
        });
      }
    };

    subscribe('cell-value', validateCell, true);
    subscribe(
      'column',
      column => {
        for (const { key: row } of state.data.values()) {
          validateCell({ row, column });
        }
      },
      true,
    );
  }, [state, subscribe]);

  const useRows = useCreateInvalidableHook(
    () => ['rows'],
    state => state.data.values(),
  );

  const useColumns = useCreateInvalidableHook(
    () => ['columns'],
    state => state.columns.values(),
  );

  const useRowState = useCreateInvalidableHook(
    (rowKey: string) => [`row-${rowKey}`],
    (state, rowKey) => state.data.get(rowKey),
  );

  const useColumnState = useCreateInvalidableHook(
    (columnKey: string) => [`column-${columnKey}`],
    (state, columnKey) => state.columns.get(columnKey),
  );

  const useColumnOrder = useCreateInvalidableHook(
    () => ['column-order'],
    state => {
      return state.columnOrder;
    },
  );
  const useRowOrder = useCreateInvalidableHook(
    () => ['column-row'],
    state => {
      return state.rowOrder;
    },
  );
  const useCellState = useCreateInvalidableHook(
    (rowKey: string, columnKey: string) => [
      'cell',
      `cell-${rowKey}-${columnKey}`,
    ],
    (state, rowKey, columnKey) => state.getCell(rowKey, columnKey),
  );

  const value: TableContextValue = {
    useRows,
    useColumns,
    useRowState,
    subscribe,
    unsubscribe,
    state,
    useColumnState,
    useColumnOrder,
    useRowOrder,
    useCellState,
    dispatch,
    props,
  };

  return (
    <TableContext.Provider value={value}>{children}</TableContext.Provider>
  );
};

export const useTable = () => useContext(TableContext);
