import {
  Annotation,
  TableDispatch,
  TableState,
  TableStateHelpers,
} from './state';

type SetRowAnnotationOptions = Annotation & { id: string };

type ClearRowAnnotationOptions = {
  id: string;
};

type SetColumnAnnotationOptions = {
  column: string;
  annotation: Annotation & { id: string };
};

type ClearColumnAnnotationOptions = {
  column?: string;
  id: string;
};

export interface RowHandle {
  setLocked(locked: boolean): void;
  isLocked(): boolean;
  setRowAnnotation(options: SetRowAnnotationOptions): void;
  clearRowAnnotation(options: ClearRowAnnotationOptions): void;
  setColumnAnnotation(options: SetColumnAnnotationOptions): void;
  clearColumnAnnotation(options: ClearColumnAnnotationOptions): void;
  columns: Record<string, string | undefined>;
}

const createRowDataProxy = (
  state: TableState,
  dispatch: TableDispatch,
  row: string,
  overlay: Record<string, string> = {},
) =>
  new Proxy(
    {},
    {
      get(_target, prop, _receiver) {
        const column = [...state.columns.entries()].find(
          ([_key, { type }]) => type === prop,
        );

        if (!column) {
          return undefined;
        }

        const [columnKey, columnState] = column;

        if (overlay[columnKey]) {
          return overlay[columnKey];
        }

        const rowObj = state.data.get(row);

        if (!rowObj) {
          throw new Error('trying to access non-existent row via proxy');
        }

        let value = rowObj.cells.get(columnKey)?.value;

        if (!value) {
          value = columnState.default ?? undefined;
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
    },
  );

export const createRowHandle = (
  state: TableStateHelpers,
  dispatch: TableDispatch,
  row: string,
  overlay = {},
): RowHandle => {
  return {
    isLocked: () => state.getRow(row).locked,
    setLocked: (locked: boolean) =>
      dispatch({ type: 'SET_ROW_LOCK', payload: { row, locked } }),
    setRowAnnotation: options =>
      dispatch({ type: 'SET_ROW_ANNOTATION', payload: { ...options, row } }),
    clearRowAnnotation: options =>
      dispatch({ type: 'CLEAR_ROW_ANNOTATION', payload: { ...options, row } }),
    setColumnAnnotation: options => {
      const column = [...state.columns.values()].find(
        c => c.type === options.column,
      );

      if (!column) {
        return;
      }

      dispatch({
        type: 'SET_CELL_ANNOTATION',
        payload: { ...options.annotation, row, column: column.key },
      });
    },
    clearColumnAnnotation: options => {
      if (options.column) {
        const column = [...state.columns.values()].find(
          c => c.type === options.column,
        );

        if (column) {
          dispatch({
            type: 'CLEAR_CELL_ANNOTATION',
            payload: { ...options, row, column: column.key },
          });
        }
      } else {
        dispatch({
          type: 'CLEAR_ROW_CELL_ANNOTATIONS',
          payload: { row, id: options.id },
        });
      }
    },
    columns: createRowDataProxy(state, dispatch, row, overlay),
  };
};
