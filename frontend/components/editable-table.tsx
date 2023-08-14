import { createContext, forwardRef, memo, MouseEventHandler, PropsWithChildren, ReactNode, useCallback, useContext, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle, Info, Loader, Lock, MoreVertical, PlusSquare } from 'react-feather';
import { uid } from 'uid';
import { parse } from 'papaparse';
import styled from 'styled-components';
import { Dropdown } from './dropdown';
import { autoUpdate, flip, FloatingPortal, useFloating, useHover, useInteractions } from '@floating-ui/react-dom-interactions';
import { offset, shift } from '@floating-ui/core';
import { useDialog } from './dialog';
import { DetectHeadersDialog } from './dialogs/detect-headers-dialog';

export type Cell = {
};

export type ValidationResult = { type: Omit<AnnotationType, 'loading'>, message: string } | string | null

export type ColumnType = {
  key: string,
  label: string,
  aliases?: string[],
  validate?: (value: string, row: RowApi) => Promise<ValidationResult> | ValidationResult
  input?: any,
  align?: 'left' | 'right',
  readOnly?: boolean,
  allowSelection?: boolean,
  render?: (value: string) => React.ReactNode
};

type SetRowAnnotationOptions = Annotation & { id: string }

type ClearRowAnnotationOptions = {
  id: string
}

type SetColumnAnnotationOptions = {
  column: string
  annotation: Annotation & { id: string }
}

type ClearColumnAnnotationOptions = {
  column?: string
  id: string
}

export interface RowApi {
  setLocked(locked: boolean): void;
  isLocked(): boolean;
  setRowAnnotation(options: SetRowAnnotationOptions): void;
  clearRowAnnotation(options: ClearRowAnnotationOptions): void;
  setColumnAnnotation(options: SetColumnAnnotationOptions): void;
  clearColumnAnnotation(options: ClearColumnAnnotationOptions): void;
  columns: Record<string, string | undefined>;
}

type RowAction = {
  key: string
  label: string
  execute: (row: RowApi) => void;
}

export type RowValidationError = string | { column: string, message: string };

export type Props = {
  columnTypes: ColumnType[],
  initialData?: string[][],
  rowActions: Array<RowAction>,
  validateRow: (row: RowApi) => RowValidationError[] | Promise<RowValidationError[]>,
};

const EditableTableWrapper = styled.div`
  overflow-x: scroll;
  margin: 2em 0;
  font-variant-numeric: tabular-nums;
  overflow: auto;
  background: hsl(0, 0%, 99%);
  border-left: 1px solid hsl(0, 0%, 90%);
  border-right: 1px solid hsl(0, 0%, 90%);
  box-shadow: 0px 1px 0px 0px hsl(0, 0%, 90%) inset, 0px -1px 0px 0px hsl(0, 0%, 90%) inset;

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
          background: rgba(0,0,0,0.05);
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

      th, td {
        border: 1px solid hsl(0, 0%, 90%);
        padding: 3px 0.5em;
        text-align: left;
        background-clip: padding-box !important;
        position: relative;
        white-space: nowrap;
      }

      tr.locked td {
        background-color: rgba(0,0,0,0.025);
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
          color: rgba(0,0,0,0.6);
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

      td.selected, td.selected input {
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

type ColumnState = {
  key: string,
  type: string | null,
  default: string | null
};

const newCellState = (): CellState => ({
  value: '',
  annotations: new Map(),
})

const getColumnKey = (state: TableState, column: string | number): { key: string, isNew: boolean } => {
  if (typeof column === 'number') {
    if (state.columnOrder.length > column) {
      return {
        key: state.columnOrder[column],
        isNew: false,
      };
    }

    const newColumns = new Array(column - state.columnOrder.length + 1)
      .fill(true)
      .map(() => uid());

    newColumns.forEach((key) => {
      state.columns.set(key, {
        key,
        type: null,
        default: null,
      });

      for (const { cells } of state.data.values()) {
        cells.set(key, newCellState());
      }
    })

    state.columnOrder.push(...newColumns); 

    return {
      key: newColumns.pop(),
      isNew: true,
    };
  } else {
    return {
      key: column,
      isNew: false,
    };
  }
}

type AnnotationType = 'error' | 'warning' | 'info' | 'loading'

type Annotation = {
  type: AnnotationType
  message: string
}

type Annotations = Map<string, Annotation>

type CellState = {
  value: string
  annotations: Annotations
}

type RowState = {
  key: string
  locked: boolean
  cells: Map<string, CellState>
  annotations: Annotations
}

type TableContextValue = {
  useRows: () => Iterable<RowState>,
  useColumns: () => Iterable<ColumnState>,
  useRowState: (rowKey: string) => RowState,
  subscribe: (tag: string, callback: (payload: unknown) => void, immediate?: boolean) => void,
  unsubscribe: (callback: Function) => void,
  useColumnState: (columnKey: string) => ColumnState
  useColumnOrder: () => Array<string>
  useRowOrder: () => Array<string>
  dispatch: (action: Action, payload?: unknown) => void
  props: Props
  ref: React.MutableRefObject<TableState>
}

const TableContext = createContext<TableContextValue | null>(null);

type TableState = {
  data: Map<string, RowState>,
  columns: Map<string, ColumnState>,
  subscriptions: Map<string, Set<{ callback: ((payload: unknown) => void), immediate: boolean }>>,
  rowOrder: string[],
  columnOrder: string[],
  batchTimeout: ReturnType<typeof setTimeout> | null,
  pendingActions: Action[],
  invalidated: { key: string, payload: unknown }[],
  invalidationTimeout: ReturnType<typeof setTimeout> | null,
};

type ActionHandler<P> = (state: TableState, payload: P, invalidate: (tag: string, payload?: unknown) => void) => void;

const resolveRowKey = (state: TableState, row: string | number) => {
  if (typeof row === 'string') {
    return row;
  }

  return state.rowOrder[row];
};

const newRowState = (state: TableState): RowState => ({
  key: uid(),
  cells: new Map([...state.columns.values()].map(({ key }) => [key, newCellState()])),
  annotations: new Map(),
  locked: false,
});

const actionHandlers: { [K in Action['type']]: ActionHandler<Extract<Action, { type: K }>['payload']> } = {
  SET_CELL_VALUE: (state, { row, column, value }, invalidate) => {
    const { key: columnKey, isNew } = getColumnKey(state, column);

    if (isNew) {
      invalidate('column-order');
    }


    let rowIndex: number;

    if (typeof row === 'string') {
      rowIndex = state.rowOrder.indexOf(row);
    } else {
      rowIndex = row;
    }

    if (state.rowOrder.length <= rowIndex) {
      for (let i = 0; i < rowIndex - state.rowOrder.length + 1; i++) {
        const newRow = newRowState(state);
        state.data.set(newRow.key, newRow);
        state.rowOrder.push(newRow.key);
      }

      invalidate(`row-order`);
    }

    const rowKey = resolveRowKey(state, row);
    const rowObject = state.data.get(rowKey);

    let cellObject = rowObject.cells.get(columnKey);

    if (!cellObject) {
      cellObject = newCellState();
      rowObject.cells.set(columnKey, newCellState());
    }

    cellObject.value = value;

    invalidate(`cell-${rowKey}-${columnKey}`);
    invalidate('cell-value', { row: rowKey, column: columnKey });
    invalidate(`row-${rowKey}`);
    invalidate('row', rowKey);
  },

  CLEAR_CELLS: (state, _, invalidate) => {
    for (const row of state.data.values()) {
      invalidate('row', row.key);

      for (const columnKey of row.cells.keys()) {
        row.cells.set(columnKey, newCellState());
      }
    }

    for (const { key: row, cells } of state.data.values()) {
      for (const [ column ] of cells) {
        invalidate('cell-value', { row, column });
      }
    }
  },

  SET_COLUMN_TYPE: (state, { column, type }, invalidate) => {
    const { key: columnKey } = getColumnKey(state, column);
    state.columns.get(columnKey).type = type;
    invalidate(`column-${columnKey}`);
    invalidate('column', columnKey);
    for (const row of state.data.keys()) {
      invalidate('row', row);
    }
  },

  DELETE_ROW: (state, { row }, invalidate) => {
    const key = resolveRowKey(state, row);

    const i = state.rowOrder.indexOf(key);
    state.rowOrder.splice(i, 1);
    state.data.delete(key);

    invalidate('row-order');
  },

  INSERT_ROW: (state, { row }, invalidate) => {
    const rowState = newRowState(state);
    let rowIndex: number;

    if (typeof row === 'string') {
      rowIndex = state.rowOrder.indexOf(row);
    } else {
      rowIndex = row;
    }

    state.data.set(rowState.key, rowState);
    state.rowOrder.splice(rowIndex, 0, rowState.key);
    
    invalidate(`row-order`);
    invalidate(`row-${rowState.key}`);
    invalidate('row', rowState.key);
  },

  APPEND_NEW_COLUMN: (state, _, invalidate) => {
    const key = uid();
    state.columnOrder.push(key);
    state.columns.set(key, {
      key,
      default: null,
      type: null,
    });

    for (const row of state.data.values()) {
      row.cells.set(key, newCellState());
    }

    invalidate('column-order');
  },

  REMOVE_COLUMN: (state, { column }, invalidate) => {
    const index = state.columnOrder.indexOf(column);
    state.columnOrder.splice(index, 1);

    state.columns.delete(column);

    for (const row of state.data.values()) {
      row.cells.delete(column);
    }

    invalidate('column-order');
  },

  APPEND_ROW: (state, _, invalidate) => {
    const row = newRowState(state);
    state.data.set(row.key, row);
    state.rowOrder.push(row.key);

    invalidate(`row-${row.key}`);
    invalidate('row', row.key);
    invalidate('row-order');
  },

  SET_CELL_ANNOTATION: (state, { row, column, id, type, message }, invalidate) => {
    const annotations: Annotations = state.data.get(row).cells.get(column).annotations;
    const annotation = annotations.get(id);

    if (annotation) {
      annotation.type = type;
      annotation.message = message;
    } else {
      annotations.set(id, { type, message });
    }

    invalidate(`cell-${row}-${column}`);
  },

  CLEAR_CELL_ANNOTATION: (state, { row, column, id }, invalidate) => {
    const annotations: Annotations = state.data.get(row).cells.get(column).annotations;
    annotations.delete(id);

    invalidate(`cell-${row}-${column}`);
  },

  SET_ROW_LOCK: (state, { row, locked }, invalidate) => {
    state.data.get(row).locked = locked;
    invalidate(`row-${row}`);
  },

  CLEAR_ROW_ANNOTATION: (state, { row, id }, invalidate) => {
    state.data.get(row)?.annotations?.delete?.(id);
    invalidate(`row-${row}`);
  },

  CLEAR_ROW_CELL_ANNOTATIONS: (state, { row, id }, invalidate) => {
    for (const [cellKey, cell] of state.data.get(row)?.cells?.entries?.() ?? []) {
      cell.annotations.delete(id);
      invalidate(`cell-${row}-${cellKey}`);
    }
  },

  SET_ROW_ANNOTATION: (state, { row, id, ...annotation }, invalidate) => {
    state.data.get(row)?.annotations?.set?.(id, annotation);
    invalidate(`row-${row}`);
  },

  SET_COLUMN_VALUE: (state, { row, columnType, value }, invalidate) => {
    let column = [...state.columns.values()].find((column) => column.type === columnType);

    if (!column) {
      const key = uid();
      const columnState = {
        key,
        default: null,
        type: columnType,
      };
      state.columns.set(key, columnState);
      state.columnOrder.push(key);
      column = columnState;

      for (const rowState of state.data.values()) {
        rowState.cells.set(key, newCellState());
        invalidate('row', rowState.key);
        invalidate(`row-${rowState.key}`);
      }

      invalidate('column-order');
      invalidate(`column-${column.key}`);
      invalidate('column', column);
    }

    state.data.get(row).cells.get(column.key).value = value;

    invalidate(`cell-${row}-${column.key}`);
    invalidate('cell-value', { row, column: column.key });
    invalidate(`row-${row}`);
    invalidate('row', row);
  },
  
  SET_COLUMN_DEFAULT: (state, { column, value }, invalidate) => {
    state.columns.get(column).default = value;

    for (const { key, cells } of state.data.values()) {
      if (!cells.get(column).value) {
        invalidate('row', key);
        invalidate(`row-${key}`);
        invalidate(`cell-${key}-${column}`);
        invalidate('cell-value', { row: key, column });
      }
    }

    invalidate(`column-${column}`);
    invalidate('column', column);
  },
};

const handleAction = (event: Action, state: TableState, invalidate: (tag: string, payload?: unknown) => void) => {
  const toInvalidate: [string, unknown][] = [];
  actionHandlers[event.type](state, event.payload as any, (tag, payload) => toInvalidate.push([tag, payload]));
  
  for (const [tag, payload] of toInvalidate) {
    invalidate(tag, payload);
  }
};

const createInvalidableHook = <A extends unknown[], T extends unknown>(
  names: (...args: A) => string[],
  hook: (value: TableState, ...args: A) => T,
): ((...args: A) => T) => {
  return (...args) => {
    const { ref, subscribe, unsubscribe } = useTable();
    const [[result], setResult] = useState([hook(ref.current, ...args)]);
    const listenerRef = useRef<() => void>();
    useEffect(() => {
      listenerRef.current = () => {
        setResult([hook(ref.current, ...args)]);
      };

      names(...args)
        .forEach((tag) => subscribe(tag, listenerRef.current));

      return () => unsubscribe(listenerRef.current);
    }, [ref, listenerRef, setResult, subscribe, unsubscribe]);

    return result;
  };
};

const useColumnOrder = createInvalidableHook(
  () => ['column-order'],
  (state) => state.columnOrder,
);

const useRowOrder = createInvalidableHook(
  () => ['row-order'],
  (state) => state.rowOrder,
);

const useRowState = createInvalidableHook((rowKey: string) => [`row-${rowKey}`], (state, rowKey) => state.data.get(rowKey));
const useCellState = createInvalidableHook((rowKey: string, columnKey: string) => ['cell', `cell-${rowKey}-${columnKey}`], (state, rowKey, columnKey) => state.data.get(rowKey).cells.get(columnKey));

const useColumnState = createInvalidableHook((columnKey: string) => [`column-${columnKey}`], (state, columnKey) => state.columns.get(columnKey));

type TableDispatch = (action: Action) => void;

const TableProvider = ({ children, ...props }: PropsWithChildren<Props>) => {
  const column = uid();
  const row = uid();

  const ref = useRef<TableState>({
    columns: new Map([[column, { type: null, default: null, annotations: new Map(), key: column }]]),
    data: new Map([[row, { key: row, cells: new Map([[column, newCellState()]]), locked: false, annotations: new Map() } ]]),
    subscriptions: new Map(),
    rowOrder: [row],
    columnOrder: [column],
    pendingActions: [],
    batchTimeout: null,
    invalidated: [],
    invalidationTimeout: null,
  });

  const invalidate = useCallback((tag: string, payload: unknown) => {
    ref.current.invalidated.push({ key: tag, payload });

    const callbacks = ref.current.subscriptions.get(tag);

    if (!callbacks) {
      return;
    }

    for (const { callback, immediate } of callbacks) {
      if (immediate) {
        callback(payload);
      }
    }

    if (!ref.current.invalidationTimeout) {
      ref.current.invalidationTimeout = setTimeout(() => {
        const invalidated = ref.current.invalidated;
        ref.current.invalidated = [];
        ref.current.invalidationTimeout = null;

        console.info(`Handling ${invalidated.length} invalidations...`);

        invalidated.forEach(({ key, payload }) => {
          const callbacks = ref.current.subscriptions.get(key);

          if (!callbacks) {
            return;
          }

          for (const { callback, immediate } of callbacks) {
            if (!immediate) {
              callback(payload);
            }
          }
        });
      }, 0);
    }
  }, [ref]);

  const subscribe = useCallback((tag: string, callback: (payload: unknown) => void, immediate = false) => {
    if (!ref.current.subscriptions.has(tag)) {
      ref.current.subscriptions.set(tag, new Set([ { callback, immediate }]));
    } else {
      const callbacks = ref.current.subscriptions.get(tag);
      callbacks.add({ callback, immediate });
    }
  }, [ref]);

  const unsubscribe = useCallback((callback: () => void) => {
    for (const subscriptions of ref.current.subscriptions.values()) {
      subscriptions.delete({ callback, immediate: true }); // FIXME
    }
  }, [ref]);
  
  const useCreateInvalidableHook = <A extends unknown[], T extends unknown>(
    names: (...args: A) => string[],
    hook: (value: TableState, ...args: A) => T,
  ): ((...args: A) => T) => {
    return (...args) => {
      const [result, setResult] = useState(hook(ref.current, ...args));
      const listenerRef = useRef<() => void>();
      useEffect(() => {
        listenerRef.current = () => {
          setResult(hook(ref.current, ...args));
        };

        names(...args)
          .forEach((tag) => subscribe(tag, listenerRef.current));

        return () => unsubscribe(listenerRef.current);
      }, [ref, listenerRef, setResult, subscribe, unsubscribe]);

      return result;
    };
  };

  useEffect(() => {
    subscribe('row', async (row: string) => {
      if (props.validateRow) {
        const rowHandle = createRowApiObject(ref.current, dispatch, row);

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
    }, true);

    const validateCell = async ({ row, column: columnKey }) => {
      const column = ref.current.columns.get(columnKey);

      if (!column) {
        return;
      }

      const columnType = props.columnTypes.find((ct: ColumnType) => ct.key === column.type); 
      const cell = ref.current.data.get(row).cells.get(column.key);

      if (columnType?.validate) {
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

        const error: ValidationResult = await new Promise((resolve) => {
          setTimeout(() => resolve(columnType.validate(value, createRowApiObject(ref.current, dispatch, row))), 0);
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
                type: error.type,
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
    subscribe('column', (column) => {
      for (const { key: row } of ref.current.data.values()) {
        validateCell({ row, column });
      }
    }, true);

  }, [ref, subscribe]);

  invalidate('row', row);

  const useRows = useCreateInvalidableHook(() => ['rows'], (state) => state.data.values());
  const useColumns = useCreateInvalidableHook(() => ['columns'], (state) => state.columns.values());
  const useRowState = useCreateInvalidableHook((rowKey: string) => [`row-${rowKey}`], (state, rowKey) => state.data.get(rowKey));
  const useColumnState = useCreateInvalidableHook((columnKey: string) => [`column-${columnKey}`], (state, columnKey) => state.columns.get(columnKey));

  const dispatch = useCallback((action) => {
    ref.current.pendingActions.push(action);

    if (!ref.current.batchTimeout) {
      ref.current.batchTimeout = setTimeout(() => {
        while (true) {
          const actions = ref.current.pendingActions;
          ref.current.pendingActions = [];

          if (actions.length === 0) {
            break;
          }

          console.info(`Handling ${actions.length} actions...`);
          actions.forEach((action) => handleAction(action, ref.current, invalidate));
        }
        
        ref.current.batchTimeout = null;
      }, 0);
    }
  }, [handleAction, ref, invalidate]);

  const useColumnOrder = useCreateInvalidableHook(() => ['column-order'], (state) => {
    return state.columnOrder;
  });
  const useRowOrder = useCreateInvalidableHook(() => ['column-row'], (state) => {
    return state.rowOrder;
  });

  const value: TableContextValue = {
    useRows,
    useColumns,
    useRowState,
    subscribe,
    unsubscribe,
    ref,
    useColumnState,
    useColumnOrder,
    useRowOrder,
    dispatch,
    props,
  };

  return (
    <TableContext.Provider value={value}>
      {children}
    </TableContext.Provider>
  )
};

const useTable = () => useContext(TableContext);

type Action =
  | { type: 'SET_ROW_ANNOTATION', payload: { row: string, id: string } & Annotation }
  | { type: 'CLEAR_ROW_CELL_ANNOTATIONS', payload: { row: string, id: string } }
  | { type: 'REMOVE_COLUMN', payload: { column: string } }
  | { type: 'SET_COLUMN_DEFAULT', payload: { column: string, value: string } }
  | { type: 'SET_CELL_ANNOTATION', payload: { row: string, column: string, id: string, type: AnnotationType, message: string } }
  | { type: 'CLEAR_CELL_ANNOTATION', payload: { row: string, column: string, id: string } }
  | { type: 'CLEAR_ROW_ANNOTATION', payload: { row: string, id: string } }
  | { type: 'SET_CELL_VALUE', payload: { row: string | number, column: string | number, value: string } }
  | { type: 'CLEAR_CELLS', payload: void }
  | { type: 'SET_COLUMN_TYPE', payload: { column: string | number, type: string } }
  | { type: 'DELETE_ROW', payload: { row: number | string } }
  | { type: 'INSERT_ROW', payload: { row: number | string } }
  | { type: 'APPEND_NEW_COLUMN', payload: {} }
  | { type: 'APPEND_ROW', payload: {} }
  | { type: 'SET_ROW_LOCK', payload: { row: string, locked: boolean } }
  | { type: 'SET_COLUMN_VALUE', payload: { row: string, columnType: string, value: string } };

const CellContent = ({ columnKey, rowKey }) => {
  const cell = useCellState(rowKey, columnKey);
  const row = useRowState(rowKey);
  const column = useColumnState(columnKey);
  const { dispatch, props } = useTable();

  if (!column) {
    return null;
  }

  const columnType = props.columnTypes.find(ct => ct.key === column.type);

  const validate = async () => {
  };

  const handleChange = async (evt: any) => {
    if (evt.target.value !== cell.value) {
      dispatch({
        type: 'SET_CELL_VALUE',
        payload: {
          row: row.key,
          column: column.key,
          value: evt.target.value,
        }
      });
    }
  };

  const [focus, setFocus] = useState(false);
  
  const [internalValue, setInternalValue] = useState(cell.value);

  useEffect(() => { validate(); }, [cell.value ?? column.default, column.type]);
  useEffect(() => setInternalValue(cell.value), [cell.value]);
  const inputRef = useRef();

  const Input = columnType?.input ?? 'input';

  return (
    <td onClick={() => { setFocus(true); inputRef.current?.focus?.(); }} tabIndex={0}>
      <Input
        ref={inputRef}
        value={internalValue}
        disabled={row.locked}
        onChange={(evt: any) => setInternalValue(evt.target.value)}
        onBlur={(evt: any) => { handleChange(evt); setFocus(false); }}
        style={{ textAlign: columnType?.align ?? 'left' }}
        placeholder={column.default}
      />
      {columnType?.render && !focus && (
        <div className="cell-overlay-content" style={{ pointerEvents: columnType?.readOnly ? 'all' : 'none' }}>
          {columnType.render(cell.value)}
        </div>
      )}
      {
        cell.annotations.size > 0 && (
          <div className="icon" style={ columnType?.align === 'right' ? { left: '-0.2em' } : { right: '-0.2em' }}>
            <StatusIndicator annotations={cell.annotations} />
          </div>
        )
      }
    </td>
  );
};

type StatusIndicatorProps = {
  annotations: Annotations
}

const STATUS_PRECEDENCE: Array<AnnotationType> = ['loading', 'error', 'warning', 'info'];

const StatusIndicator = (props: StatusIndicatorProps) => {
  const [open, setOpen] = useState(false);

  const { x, y, reference, floating, strategy, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: 'bottom-start',
    middleware: [
      offset({
        mainAxis: 8,
        crossAxis: -7,
      }),
      shift(),
      flip(),
    ],
    whileElementsMounted: autoUpdate,
  });

  const { getReferenceProps, getFloatingProps } = useInteractions([
    useHover(context, {
      move: false,
    }),
  ]);

  if (props.annotations.size === 0) {
    return null;
  }

  const [{ type }] = [...props.annotations.values()]
    .sort((a, b) => STATUS_PRECEDENCE.indexOf(a.type) - STATUS_PRECEDENCE.indexOf(b.type));

  const getIcon = (type: AnnotationType) => ({
    loading: (props: any) => <Loader className={`animate-[spin_3s_linear_infinite] duration-200 text-blue-500`} {...props} />,
    error: (props: any) => <AlertTriangle className="text-red-500" {...props} />,
    success: (props: any) => <CheckCircle className="text-green-500" {...props} />,
    info: (props: any) => <Info className="text-blue-500" {...props} />
  })[type];

  const Icon = getIcon(type) ?? getIcon('error');

  return (
    <div>
      <div ref={reference} {...getReferenceProps({ style: { width: '1.2em', height: '1.2em' } })}>
        <Icon style={{ width: '100%', height: '100%' }} />
      </div>
      <FloatingPortal>
        { open && (
          <div
            ref={floating}
            {...getFloatingProps()}
            style={{ position: strategy, top: y ?? 0, left: x ?? 0, width: 'max-content', display: 'flex', flexDirection: 'column', gap: '0.2em', maxWidth: '20em' }}
          >
            {[...props.annotations.entries()].map(([id, { type, message }]) => {
              const Icon = getIcon(type) ?? getIcon('error');

              return (
                <div key={id} className={`text-sm py-1 px-2 flex gap-2 items-center ${{error: 'bg-red-500', info: 'bg-blue-500', loading: 'bg-blue-500', success: 'bg-green-500'}[type]} rounded shadow-md text-white`}>
                  <Icon className="text-white" style={{ width: '1.2em', hieght: '1.2em', flexShrink: '0' }} />
                  {message ?? ''}
                </div>
              );
            })}
          </div>
        ) }
      </FloatingPortal>
    </div>
  );
};

export const EditableTable = memo(forwardRef((props: Props, ref) => {
  return (
    <TableProvider {...props}>
      <EditableTableInner ref={ref} {...props} />
    </TableProvider>
  );
}));

const ColumnHeader = ({ columnKey: key }) => {
  const { dispatch, props, ref: tableRef } = useTable();
  const column = useColumnState(key);
  const rows = useRowOrder();
  const ref = useRef<HTMLTableCellElement>(null);

  if (!column) {
    return null;
  }

  const handleColumnTypeChange = (column: string, type: string) => dispatch({
    type: 'SET_COLUMN_TYPE',
    payload: { column, type },
  });

  const handleMouseDown: MouseEventHandler = (evt) => {
    if (!ref.current) {
      return;
    }

    const startX = evt.screenX;
    const startWidth = ref.current.getClientRects()[0].width;
    
    const onMouseMove = (evt: MouseEvent) => {
      ref.current.style.width = (evt.screenX - startX + startWidth) + 'px';
    };

    document.addEventListener('mouseup', () => {
      document.removeEventListener('mousemove', onMouseMove);
    });

    document.addEventListener('mousemove', onMouseMove);
  };

  const handleSize = () => {
    let maxWidth = 0;

    for (const row of tableRef.current.data.values()) {
      const value = row.cells.get(column.key).value;
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
            label={props.columnTypes.find((c: ColumnType) => c.key === column.type)?.label ?? 'No type'}
            options={props.columnTypes.filter((ct: ColumnType) => ct.allowSelection !== false).map((columnType: ColumnType) => ({
              value: columnType.key,
              text: columnType.label,
            }))}
            onSelect={(type) => handleColumnTypeChange(key, type)}
          />
          <div className="grow" />
          <Dropdown
            className="flex"
            renderTrigger={(props) => <button {...props}><MoreVertical style={{ width: '1.2em' }} /></button>}
            showArrow={false}
            options={[
              { text: 'Fit to content', onSelect: handleSize },
              { text: 'Remove column', onSelect: handleRemoveColumn },
            ]}
          />
        </div>
      </th>
      <th rowSpan={rows.length + 2} style={{ width: 0, padding: 0, borderLeft: 'hidden' }} className="resize-handle" onMouseDown={handleMouseDown}></th>
    </>
  );
};

const DataRow = ({ rowKey }) => {
  const { dispatch, props, ref } = useTable();
  const row = useRowState(rowKey);
  const columns = useColumnOrder();
  const rows = useRowOrder();

  const i = rows.indexOf(rowKey);

  const handleDeleteRow = (row: string) => dispatch({
    type: 'DELETE_ROW',
    payload: { row },
  });

  const handleAddRowBelow = (row: string) => dispatch({
    type: 'INSERT_ROW',
    payload: { row: row + 1 },
  });


  return (
    <tr key={rowKey} className={row.locked ? 'locked' : ''}>
      <th style={{ borderRightColor: '#fafafa', padding: '0' }} className="row-menu">
        <Dropdown
          options={[
            { text: 'Delete row', onSelect: () => handleDeleteRow(row.key) },
            { text: 'Add row below', onSelect: () => handleAddRowBelow(row.key) },
            { text: 'Lock row', onSelect: () => dispatch({ type: 'SET_ROW_LOCK', payload: { row: row.key, locked: true } }) },
            ...props.rowActions.map((action: RowAction) => ({
              text: action.label,
              onSelect: () => {
                action.execute(createRowApiObject(ref.current, dispatch, row.key));
              },
            }))
          ]}
          showArrow={false}
          label={
            <MoreVertical style={{ width: '1.2em', color: 'rgba(0,0,0,0.5)' }} />
          }
        />
      </th>
      <th style={{ padding: 0, borderRightColor: '#fafafa' }}>
        <div style={{ display: 'flex', gap: '0.5em' }}>
          { row.annotations.size > 0 && <StatusIndicator annotations={row.annotations} /> }
          { row.locked && <Lock style={{ width: '1em', color: 'rgba(0,0,0,0.5)' }} />}
        </div>
      </th>
      <th className="row-number">{i + 1}</th>
      { columns.map((columnKey) => <CellContent key={columnKey} rowKey={rowKey} columnKey={columnKey} />) }
    </tr>
  );
};

const createRowDataProxy = (state: TableState, dispatch: TableDispatch, row: string, overlay: Record<string, string> = {}) => new Proxy({}, {
  get (_target, prop, _receiver) {
    const column = [...state.columns.entries()]
      .find(([_key, { type }]) => type === prop);

    if (!column) {
      return undefined;
    }

    const [ columnKey, columnState ] = column;

    if (overlay[columnKey]) {
      return overlay[columnKey];
    }

    const rowObj = state.data.get(row);

    if (!rowObj) {
      throw new Error('trying to access non-existent row via proxy');
    }

    let value = rowObj.cells.get(columnKey)?.value;

    if (!value) {
      value = columnState.default;
    }

    return value ?? '';
  },

  set(_target, prop, value) {
    if (typeof prop !== 'string') {
      return false;
    }

    dispatch({
      type: 'SET_COLUMN_VALUE',
      payload: {
        columnType: prop,
        row,
        value,
      },
    });

    return true;
  },
});

const createRowApiObject = (state: TableState, dispatch: TableDispatch, row: string, overlay = {}): RowApi => ({
  isLocked: () => state.data.get(row).locked,
  setLocked: (locked: boolean) => dispatch({ type: 'SET_ROW_LOCK', payload: { row, locked } }),
  setRowAnnotation: (options) => dispatch({ type: 'SET_ROW_ANNOTATION', payload: { ...options, row } }),
  clearRowAnnotation: (options) => dispatch({ type: 'CLEAR_ROW_ANNOTATION', payload: { ...options, row } }),
  setColumnAnnotation: (options) => {
    const column = [...state.columns.values()].find(c => c.type === options.column);

    if (!column) {
      return;
    }

    dispatch({ type: 'SET_CELL_ANNOTATION', payload: { ...options.annotation, row, column: column.key } });
  },
  clearColumnAnnotation: (options) => {
    if (options.column) {
      const column = [...state.columns.values()].find(c => c.type === options.column);
      dispatch({ type: 'CLEAR_CELL_ANNOTATION', payload: { ...options, row, column: column.key } });
    } else {
      dispatch({ type: 'CLEAR_ROW_CELL_ANNOTATIONS', payload: { row, id: options.id } });
    }
  },
  columns: createRowDataProxy(state, dispatch, row, overlay),
});

export interface TableRef {
  getRow(key: string): RowApi
  setData(data: string[][]): void
  getRowIterator(): Iterable<RowApi>
}

export const EditableTableInner = forwardRef((props: Props, ref) => {
  const { ref: tableRef, dispatch } = useTable();
  const columns = useColumnOrder();
  const rows = useRowOrder();
  const showHeadersDetectedDialog = useDialog(DetectHeadersDialog);

  useEffect(() => {
    if (props.initialData) {
      dispatch({
        type: 'CLEAR_CELLS',
        payload: null,
      });

      props.initialData
        .flatMap((row, i) => row.map((cell, j) => [i, j, cell] as [number, number, string]))
        .forEach(([row, column, value]) => dispatch({
          type: 'SET_CELL_VALUE',
          payload: { row, column, value },
        }));
    }
  }, [props.initialData]);

  const handleAppendNewColumn = () => dispatch({
    type: 'APPEND_NEW_COLUMN',
    payload: {},
  });

  const handleAppendNewRow = () => dispatch({
    type: 'APPEND_ROW',
    payload: {},
  });

  useImperativeHandle(ref, (): TableRef => {
    return {
      getRow: (key: string) => createRowApiObject(tableRef.current, dispatch, key),
      setData: (data: string[][]) => {
        dispatch({
          type: 'CLEAR_CELLS',
          payload: null,
        });

        data
          .flatMap((row, i) => row.map((cell, j) => [i, j, cell] as [number, number, string]))
          .forEach(([row, column, value]) => dispatch({
            type: 'SET_CELL_VALUE',
            payload: { row, column, value },
          }));
      },
      getRowIterator: () => ({
        rows: [...tableRef.current.data.keys()],

        index: 0,

        next() {
          const i = this.index;

          if (i >= this.rows.length) {
            return { done: true, value: undefined };
          }

          this.index += 1;

          return {
            done: false,
            value: createRowApiObject(tableRef.current, dispatch, this.rows[i]),
          };
        },

        [Symbol.iterator]() {
          return this;
        },
      }),
    };
  }, [createRowApiObject]);

  const setContentFromCsv = async (data: string) => {
    let parsed: string[][];

    try {
      parsed = parse(data).data;
    } catch (err) {
      parsed = [[data]];
    }

    const lastRow = parsed[parsed.length - 1];

    if (lastRow.every((value) => value === '')) {
      parsed.pop();
    }

    const firstRow = parsed[0];
    let detectHeaders = false;
    const columnAliases = new Map(props.columnTypes.flatMap((ct) => [ ct.label, ct.key, ...(ct.aliases ?? []) ].map((alias) => [alias.toLowerCase(), ct.key])));

    if (firstRow.some((value) => columnAliases.has(value.toLowerCase()))) {
      const result = await showHeadersDetectedDialog({
        headers: firstRow.filter((value) => columnAliases.has(value.toLowerCase())),
      });

      if (result) {
        parsed.splice(0, 1);
        detectHeaders = true;
      }
    }

    const startRow = 0;
    const startColumn = 0;

    for (let row = startRow; row < startRow + parsed.length; row++) {
      for (let column = startColumn; column < startColumn + parsed[row - startRow].length; column++) {
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

  const handleFileDrop = async (evt: React.MouseEvent<any> & { dataTransfer: DataTransfer }) => {
    evt.preventDefault();

    const [ file ]: File[] = [...evt.dataTransfer.files];
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
    <EditableTableWrapper onDrop={handleFileDrop} onDragOver={(evt) => evt.preventDefault()} onDragEnter={(evt) => evt.preventDefault()}>
      <div>
        <div className="inline-flex flex-col">
          <table>
            <tr>
              <th colSpan={3} rowSpan={2} />
              { columns.map((key) => <ColumnHeader key={key} columnKey={key} />) }
            </tr>
            <tr>
              { columns.map((key) => <ColumnDefaultHeader key={key} columnKey={key} />) }
            </tr>
            { rows.map((key) => <DataRow key={key} rowKey={key} />) }
          </table>
          <div className="flex p-3 text-gray-500 text-sm items-center gap-1 cursor-pointer" onClick={handleAppendNewRow}>
            <PlusSquare />
            Add row
          </div>
        </div>
        <div className="table-right-content flex flex-col grow">
          <div className="new-column-action cursor-pointer" onClick={handleAppendNewColumn}>
            <PlusSquare />
            Add column
          </div>
          <div className="text-gray-500 text-sm p-5 self-center">
            Drag and drop CSV files here <br /> or <button onClick={handleFileUpload} className="underline font-semibold">upload one by clicking here</button>.
          </div>
        </div>
      </div>
    </EditableTableWrapper>
  );
});

const ColumnDefaultHeader = ({ columnKey }) => {
  const { dispatch } = useTable();
  const column = useColumnState(columnKey);
  const [value, setValue] = useState(column.default);

  return (
    <th className="!text-gray-700">
      <input
        placeholder="No default"
        value={value}
        className="w-full bg-transparent !text-[inherit]"
        onChange={(evt) => {
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
