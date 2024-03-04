import { useCallback, useEffect, useMemo, useRef } from 'react';
import { uid } from 'uid';
import { useInvalidation } from './invalidation';

export type AnnotationType = 'error' | 'warning' | 'info' | 'loading';

export type Annotation = {
  type: AnnotationType;
  message: string;
};

export type Annotations = Map<string, Annotation>;

export type ColumnState = {
  key: string;
  type: string | null;
  default: string | null;
};

export type CellState = {
  value: string;
  annotations: Annotations;
};

export type RowState = {
  key: string;
  locked: boolean;
  cells: Map<string, CellState>;
  annotations: Annotations;
};

export type TableState = {
  data: Map<string, RowState>;
  columns: Map<string, ColumnState>;
  rowOrder: string[];
  columnOrder: string[];
  batchTimeout: ReturnType<typeof setTimeout> | null;
  pendingActions: Action[];
};

export type Action =
  | {
      type: 'SET_ROW_ANNOTATION';
      payload: { row: string; id: string } & Annotation;
    }
  | { type: 'CLEAR_ROW_CELL_ANNOTATIONS'; payload: { row: string; id: string } }
  | { type: 'REMOVE_COLUMN'; payload: { column: string } }
  | { type: 'SET_COLUMN_DEFAULT'; payload: { column: string; value: string } }
  | {
      type: 'SET_CELL_ANNOTATION';
      payload: {
        row: string;
        column: string;
        id: string;
        type: AnnotationType;
        message: string;
      };
    }
  | {
      type: 'CLEAR_CELL_ANNOTATION';
      payload: { row: string; column: string; id: string };
    }
  | { type: 'CLEAR_ROW_ANNOTATION'; payload: { row: string; id: string } }
  | {
      type: 'SET_CELL_VALUE';
      payload: { row: string | number; column: string | number; value: string };
    }
  | { type: 'CLEAR_CELLS'; payload: void }
  | {
      type: 'SET_COLUMN_TYPE';
      payload: { column: string | number; type: string };
    }
  | { type: 'DELETE_ROW'; payload: { row: number | string } }
  | { type: 'INSERT_ROW'; payload: { row: number | string } }
  | { type: 'APPEND_NEW_COLUMN'; payload: Record<string, never> }
  | { type: 'APPEND_ROW'; payload: Record<string, never> }
  | { type: 'SET_ROW_LOCK'; payload: { row: string; locked: boolean } }
  | {
      type: 'SET_COLUMN_VALUE';
      payload: { row: string; columnType: string; value: string };
    };

export class TableStateHelpers implements TableState {
  data!: Map<string, RowState>;
  columns!: Map<string, ColumnState>;
  subscriptions!: Map<
    string,
    Set<{ callback: (payload: any) => void; immediate: boolean }>
  >;
  rowOrder!: string[];
  columnOrder!: string[];
  batchTimeout!: NodeJS.Timeout | null;
  pendingActions!: Action[];
  invalidated!: { key: string; payload: any }[];
  invalidationTimeout!: NodeJS.Timeout | null;

  static wrap(state: TableState) {
    return new Proxy(new TableStateHelpers(), {
      get(target, prop) {
        if (prop in state) {
          return state[prop as keyof TableState];
        }

        return Reflect.get(target, prop);
      },
      set(target, prop: keyof TableState, value) {
        if (Reflect.set(state, prop, value)) {
          return true;
        }

        return Reflect.set(target, prop, value);
      },
    });
  }

  getColumn(key: string) {
    const state = this.columns.get(key);
    assert(state, `no such column: ${key}`);
    return state;
  }

  getColumnKey(column: string | number): { key: string; isNew: boolean } {
    if (typeof column === 'number') {
      if (this.columnOrder.length > column) {
        return {
          key: this.columnOrder[column],
          isNew: false,
        };
      }

      const newColumns = new Array(column - this.columnOrder.length + 1)
        .fill(true)
        .map(() => uid());

      newColumns.forEach(key => {
        this.columns.set(key, {
          key,
          type: null,
          default: null,
        });

        for (const { cells } of this.data.values()) {
          cells.set(key, newCellState());
        }
      });

      this.columnOrder.push(...newColumns);

      return {
        key: newColumns[newColumns.length - 1],
        isNew: true,
      };
    } else {
      return {
        key: column,
        isNew: false,
      };
    }
  }

  getCell(row: string, column: string) {
    const rowState = this.getRow(row);
    const cellState = rowState.cells.get(column);
    assert(cellState, `no such cell: (${row}, ${column})`);
    return cellState;
  }

  getRow(row: string) {
    const rowState = this.data.get(row);
    assert(rowState, `no such row: ${row}`);
    return rowState;
  }
}

type ActionHandler<P> = (
  state: TableStateHelpers,
  payload: P,
  invalidate: (tag: string, payload?: any) => void,
) => void;

export type TableDispatch = (action: Action) => void;

export type ActionHandlers = {
  [K in Action['type']]: ActionHandler<Extract<Action, { type: K }>['payload']>;
};

const resolveRowKey = (state: TableState, row: string | number) => {
  if (typeof row === 'string') {
    return row;
  }

  return state.rowOrder[row];
};

const newCellState = (): CellState => ({
  value: '',
  annotations: new Map(),
});

const newRowState = (state: TableState): RowState => ({
  key: uid(),
  cells: new Map(
    [...state.columns.values()].map(({ key }) => [key, newCellState()]),
  ),
  annotations: new Map(),
  locked: false,
});

const actionHandlers: {
  [K in Action['type']]: ActionHandler<Extract<Action, { type: K }>['payload']>;
} = {
  SET_CELL_VALUE: (state, { row, column, value }, invalidate) => {
    const { key: columnKey, isNew } = state.getColumnKey(column);

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

      invalidate('row-order');
    }

    const rowKey = resolveRowKey(state, row);
    const rowObject = state.data.get(rowKey);

    assert(rowObject, '');

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
      for (const [column] of cells) {
        invalidate('cell-value', { row, column });
      }
    }
  },

  SET_COLUMN_TYPE: (state, { column, type }, invalidate) => {
    const { key: columnKey } = state.getColumnKey(column);
    const columnState = state.getColumn(columnKey);
    columnState.type = type;
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

    invalidate('row-order');
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
      const cell = row.cells.get(column);

      if (cell?.value) {
        invalidate(`row-${row.key}`);
        invalidate('row', row.key);
      }

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

  SET_CELL_ANNOTATION: (
    state,
    { row, column, id, type, message },
    invalidate,
  ) => {
    const { annotations } = state.getCell(row, column);
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
    const { annotations } = state.getCell(row, column);
    annotations.delete(id);

    invalidate(`cell-${row}-${column}`);
  },

  SET_ROW_LOCK: (state, { row, locked }, invalidate) => {
    state.getRow(row).locked = locked;
    invalidate(`row-${row}`);
  },

  CLEAR_ROW_ANNOTATION: (state, { row, id }, invalidate) => {
    state.data.get(row)?.annotations?.delete?.(id);
    invalidate(`row-${row}`);
  },

  CLEAR_ROW_CELL_ANNOTATIONS: (state, { row, id }, invalidate) => {
    for (const [cellKey, cell] of state.data.get(row)?.cells?.entries?.() ??
      []) {
      cell.annotations.delete(id);
      invalidate(`cell-${row}-${cellKey}`);
    }
  },

  SET_ROW_ANNOTATION: (state, { row, id, ...annotation }, invalidate) => {
    state.data.get(row)?.annotations?.set?.(id, annotation);
    invalidate(`row-${row}`);
  },

  SET_COLUMN_VALUE: (state, { row, columnType, value }, invalidate) => {
    let column = [...state.columns.values()].find(
      column => column.type === columnType,
    );

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

    state.getCell(row, column.key).value = value;

    invalidate(`cell-${row}-${column.key}`);
    invalidate('cell-value', { row, column: column.key });
    invalidate(`row-${row}`);
    invalidate('row', row);
  },

  SET_COLUMN_DEFAULT: (state, { column, value }, invalidate) => {
    const columnState = state.columns.get(column);
    assert(columnState, `no such column: ${column}`);
    columnState.default = value;

    for (const { key, cells } of state.data.values()) {
      if (!cells.get(column)?.value) {
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

function assert<T>(
  assertion: T | null | undefined,
  message?: string,
): asserts assertion is T {
  if (!assertion) {
    throw new Error(
      message ? `Assertion failed: ${message}` : 'Assertion failed!',
    );
  }
}

const handleAction = (
  event: Action,
  state: TableState,
  invalidate: (tag: string, payload?: any) => void,
) => {
  const toInvalidate: [string, any][] = [];
  const helpers = TableStateHelpers.wrap(state);
  actionHandlers[event.type](helpers, event.payload as any, (tag, payload) =>
    toInvalidate.push([tag, payload]),
  );

  for (const [tag, payload] of toInvalidate) {
    invalidate(tag, payload);
  }
};

const getInitialState = (): TableState => {
  const column = uid();
  const row = uid();

  return {
    columns: new Map([
      [
        column,
        { type: null, default: null, annotations: new Map(), key: column },
      ],
    ]),
    data: new Map([
      [
        row,
        {
          key: row,
          cells: new Map([[column, newCellState()]]),
          locked: false,
          annotations: new Map(),
        },
      ],
    ]),
    rowOrder: [row],
    columnOrder: [column],
    pendingActions: [],
    batchTimeout: null,
  };
};

export const useTableState = () => {
  const initialState = useMemo(getInitialState, []);
  const ref = useRef<TableState>(initialState);
  const invalidation = useInvalidation();
  const { invalidate } = invalidation;

  const dispatch = useCallback(
    (action: Action) => {
      ref.current.pendingActions.push(action);

      if (!ref.current.batchTimeout) {
        ref.current.batchTimeout = setTimeout(() => {
          // eslint-disable-next-line no-constant-condition
          while (true) {
            const actions = ref.current.pendingActions;
            ref.current.pendingActions = [];

            if (actions.length === 0) {
              break;
            }

            console.info(`Handling ${actions.length} actions...`);
            actions.forEach(action =>
              handleAction(action, ref.current, invalidate),
            );
          }

          ref.current.batchTimeout = null;
        }, 0);
      }
    },
    [handleAction, ref, invalidate],
  );

  const state = useMemo(() => TableStateHelpers.wrap(ref.current), [ref]);

  useEffect(() => {
    invalidate('row', initialState.rowOrder[0]);
  }, [initialState]);

  return { state, dispatch, ...invalidation };
};
