/* eslint-disable @typescript-eslint/no-explicit-any */

import { identity } from 'fp-ts/function';
import { Draft, Immutable, produce } from 'immer';
import {
  Dispatch,
  PropsWithChildren,
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import {
  ChevronDown,
  ChevronUp,
  Circle,
  Code,
  Loader,
  MinusSquare,
  MoreVertical,
  PlusSquare,
  TrendingDown,
  TrendingUp,
} from 'react-feather';
import { pipe, reduce, map, debounce } from 'remeda';
import { Dropdown, DropdownItem } from './dropdown';
import { FilledDisc } from './filled-disc';
import { useMergeRefs } from '@floating-ui/react';

export type Row<C = any> = { key: string | number; children?: Array<C> };

export type Action<R> = {
  key: string;
  text: string;
  rowWise?: boolean;
  disabled?: boolean | ((r: R) => boolean);
  onSelect?: (rows: Array<R>) => void;
};

export type Column<R, Name extends string, Value> = {
  name: Name;
  key: string;
  sortable?: boolean;
  getValue: keyof R | ((row: R) => Value);
  render?: (value: Value, row: R) => any;
  align?: 'right';
  compareBy?: (value: Value) => any;
  width?: string;
  filter?: {
    search?: boolean;
    options?: Value[];
    range?: {
      min: number;
      max: number;
      step: number;
    };
  };
};

export type State = {
  sort: [string, 'asc' | 'desc'] | null;
  filters: Record<string, FilterState>;
  rows: (string | number)[];
  columnWidths: Record<string, number>;
};

type CreateReducerHandlers<State> = Record<
  string,
  (draft: Draft<State>, payload: any) => State | void | undefined
>;
type HandlerPayload<Handler> = Handler extends (
  draft: Draft<State>,
  payload: infer P,
) => State | void | undefined
  ? P
  : Record<string, never>;
type CreateReducerEvent<Handlers extends CreateReducerHandlers<any>> = {
  [T in keyof Handlers]: HandlerPayload<Handlers[T]> & { type: T };
}[keyof Handlers];

interface CreateReducer {
  <State, Handlers extends CreateReducerHandlers<State>>(
    handlers: Handlers,
  ): (
    state: Immutable<Draft<State>>,
    event: CreateReducerEvent<Handlers>,
  ) => State;
}

const createReducer: CreateReducer = handlers =>
  produce((draft, event) => handlers[event.type](draft, event));

const reducer = createReducer({
  cycleSort(state: State, event: { column: string }) {
    if (state?.sort?.[0] === event.column) {
      if (state.sort[1] === 'desc') {
        state.sort[1] = 'asc';
      } else {
        state.sort = null;
      }
    } else {
      state.sort = [event.column, 'desc'];
    }
  },

  resetFilters(state) {
    state.filters = {};
  },

  resetSort(state) {
    state.sort = null;
  },

  toggleRowSelection(state, event: { row: string | number }) {
    const index = state.rows.indexOf(event.row);

    if (index >= 0) {
      state.rows.splice(index, 1);
    } else {
      state.rows.push(event.row);
    }
  },

  clearSelection(state) {
    state.rows = [];
  },

  setSelectedRows(state, event: { rows: (string | number)[] }) {
    state.rows = event.rows;
  },

  selectRows(state, event: { rows: (string | number)[] }) {
    state.rows = [...new Set([...state.rows, ...event.rows])];
  },

  unselectRows(state, event: { rows: (string | number)[] }) {
    for (const row of event.rows) {
      const index = state.rows.indexOf(row);

      if (index >= 0) {
        state.rows.splice(index, 1);
      }
    }
  },

  cycleFilterOption(
    state,
    event: {
      column: string;
      value: unknown;
    },
  ) {
    let filters = state.filters[event.column];

    if (!filters) {
      filters = state.filters[event.column] = {
        allowlist: [],
        blocklist: [],
      };
    }

    const allowlistIndex = filters.allowlist.indexOf(event.value);

    if (allowlistIndex > -1) {
      filters.allowlist.splice(allowlistIndex, 1);
      filters.blocklist.push(event.value);
      return;
    }

    const blocklistIndex = filters.blocklist.indexOf(event.value);

    if (blocklistIndex > -1) {
      filters.blocklist.splice(blocklistIndex, 1);
    } else {
      filters.allowlist.push(event.value);
    }
  },

  setFilterSearch(state, event: { column: string; search: string }) {
    let filters = state.filters[event.column];

    if (!filters) {
      filters = state.filters[event.column] = {
        allowlist: [],
        blocklist: [],
      };
    }

    filters.search = event.search;
  },

  setColumnSize(state, event: { column: string; width: number }) {
    state.columnWidths[event.column] = event.width;
  },

  resetColumnWidths(state) {
    state.columnWidths = {};
  },
});

export interface Persister {
  load(): State;
  store(state: State): void;
}

export type TableViewProps<
  R extends Row<R>,
  ColumnNames extends string,
  ColumnTypeMap extends Record<ColumnNames, Column<R, any, any>>,
> = {
  rows: R[];
  columns: Array<
    { [Name in ColumnNames]: Column<R, Name, ColumnTypeMap[Name]> }[ColumnNames]
  >;
  onRowClick?: (row: R) => void;
  fetchMore?: (number: number | null) => void;
  onSortChange?: (column?: string, direction?: 'asc' | 'desc') => void;
  onFilterChange?: (filters: Record<string, FilterState>) => void;
  loading?: boolean;
  refreshing?: boolean;
  showBottomLoading?: boolean;
  selectable?: boolean;
  actions?: Array<Action<R>>;
  emptyMessage?: JSX.Element | string;
  hideTools?: boolean;
  footer?: React.ReactNode;
  persist?: string;
  more?: boolean;
  initialSort?: {
    column: ColumnNames;
    direction: 'asc' | 'desc';
  };
};

const getColumnValue = <R extends Row, Value>(
  column: Column<R, any, Value>,
  row: R,
): Value => {
  if (typeof column.getValue === 'function') {
    return column.getValue(row);
  }

  return row[column.getValue as keyof R] as Value;
};

type FilterState = {
  search?: string;
  allowlist: Array<any>;
  blocklist: Array<any>;
};

type FilterDropdownItemProps = {
  column: Column<any, any, any>;
  rows: Row[];
};

const FilterDropdownItem = ({ column, rows }: FilterDropdownItemProps) => {
  const { state, dispatch } = useContext(TableContext);

  const options = state.filters[column.key] ?? {
    allowlist: [],
    blocklist: [],
    search: '',
  };

  const debouncer = useMemo(
    () =>
      debounce(
        (search: string) => {
          dispatch({
            type: 'setFilterSearch',
            column: column.key,
            search,
          });
        },
        { waitMs: 1000 },
      ),
    [column.key, dispatch],
  );

  let containsArrays = false;

  const rowValues: [Row | null, any][] = (
    column.filter?.options?.map(v => [null, v]) ??
    rows.map(r => [r, getColumnValue(column, r)])
  ).flatMap(([r, value]): [Row, any][] => {
    if (Array.isArray(value)) {
      containsArrays = true;
      return value.map(v => [r, v]);
    } else {
      return [[r, value]];
    }
  });

  const [currentSearch, _setCurrentSearch] = useState(options.search ?? '');

  const setCurrentSearch = useCallback(
    (search: string) => {
      _setCurrentSearch(search);
      debouncer.call(search);
    },
    [_setCurrentSearch, debouncer],
  );

  useEffect(
    () => _setCurrentSearch(options.search ?? ''),
    [_setCurrentSearch, options.search],
  );

  const compareBy = column.compareBy ?? identity;

  return (
    <Dropdown
      searchable={!!column.filter?.search}
      search={currentSearch}
      onSearchChange={setCurrentSearch}
      keepOpen
      flat
      scroll
      label={
        <div
          className={`flex ${
            options.allowlist.length + options.blocklist.length > 0 &&
            'text-blue-500'
          } grow items-center justify-between`}
        >
          <span className="flex-grow">{column.name}</span>
          <span className="relative ml-2 text-gray-400">
            {(options.search && options.search.length > 0) ||
            options.allowlist.length + options.blocklist.length > 0
              ? 'Active'
              : 'Any'}
          </span>
        </div>
      }
      options={pipe(
        rowValues,
        reduce(
          ({ list, values }, [row, value]) => {
            if (values.has(compareBy(value))) {
              return { list, values };
            } else {
              values.add(compareBy(value));
              return {
                list: [...list, [row, value]] as [Row, any][],
                values,
              };
            }
          },
          {
            list: [] as [Row, any][],
            values: new Set() as Set<any>,
          },
        ),
        r => r.list,
        map(([row, value]) => {
          let icon = null;

          const compareValue = compareBy(value);

          if (options.allowlist.includes(compareValue)) {
            icon = <PlusSquare className="size-4 text-green-500" />;
          } else if (options.blocklist.includes(compareValue)) {
            icon = <MinusSquare className="size-4 text-red-500" />;
          }

          let displayValue = String(value);

          if (column.render) {
            let renderValue = value;

            if (containsArrays && !Array.isArray(renderValue)) {
              renderValue = [value];
            }

            displayValue = column.render(renderValue, row);
          }

          return {
            value,
            label: icon,
            text: displayValue,
          };
        }),
      )}
      onSelect={value => {
        const compareValue = compareBy(value);

        dispatch({
          type: 'cycleFilterOption',
          column: column.key,
          value: compareValue,
        });
      }}
    />
  );
};

type TableCellProps<Row, Value> = {
  column: Column<Row, any, Value>;
  columnIndex: number;
  row: Row;
  rowIndex: number;
};

const TableCell = <R extends Row, Value extends ReactNode>(
  props: TableCellProps<R, Value>,
) => {
  const { props: tableProps, getCellMeasurerRef } = useContext(TableContext);
  const { onRowClick } = tableProps;
  const { column, row } = props;

  const value = getColumnValue(column, row);
  let content = value;

  if (column.render) {
    content = column.render(value, row);
  }

  return (
    <div
      key={column.key}
      role="cell"
      data-row={props.rowIndex}
      data-column={column.name}
      data-value={`${value}`}
      ref={
        props.rowIndex === 0 ? getCellMeasurerRef(props.columnIndex) : undefined
      }
      className={`
        relative
        flex
        min-w-0
        items-center
        overflow-hidden
        whitespace-nowrap
        border-gray-100
        px-3
        py-2
        ${onRowClick && 'cursor-pointer'}
        ${column.align === 'right' && 'justify-end'}
      `}
    >
      {content}
    </div>
  );
};

type TableRowProps<R extends Row> = {
  data: R;
  rowIndex: number;
  rowCount: number;
  onRowClick?: (data: R) => void;
  selectable: boolean;
  columns: Column<any, any, any>[];
  actions?: Action<any>[];
};

const TableRow = <R extends Row>({
  data,
  selectable,
  onRowClick,
  rowIndex,
  rowCount,
  columns,
  actions,
}: TableRowProps<R>) => {
  const { state, dispatch } = useContext(TableContext);

  const selected = state.rows.includes(data.key);

  return (
    <>
      <div
        role="row"
        data-row={rowIndex}
        className="row contents [&>*:not(:first-child)]:border-l [&>*]:border-b [&>*]:border-gray-100"
        onClick={() => onRowClick?.(data)}
      >
        {selectable && (
          <button
            className="relative flex items-center justify-center px-3 py-2"
            onClick={evt => {
              evt.stopPropagation();
              dispatch({
                type: 'toggleRowSelection',
                row: data.key,
              });
            }}
          >
            {selected ? (
              <FilledDisc
                className="text-blue-500"
                style={{ width: '1em', strokeWidth: '2.5px' }}
              />
            ) : (
              <Circle
                className="text-gray-400"
                style={{ width: '1em', strokeWidth: '2.5px' }}
              />
            )}
          </button>
        )}
        {columns.map((column, i) => (
          <TableCell
            column={column}
            row={data}
            columnIndex={i + (selectable ? 1 : 0)}
            rowIndex={rowIndex}
          />
        ))}
        {actions && (
          <div
            className={`
              relative flex items-center justify-center border-l border-b-gray-100 border-l-gray-100
              ${rowIndex < rowCount - 1 && 'border-b'}
            `}
            onClick={evt => evt.stopPropagation()}
          >
            <Dropdown
              flat
              label={<MoreVertical />}
              showArrow={false}
              className="table-row-actions flex h-full w-full items-center justify-center text-sm text-gray-500"
              options={actions
                .filter(a =>
                  typeof a.disabled === 'function'
                    ? !a.disabled(data)
                    : !a.disabled,
                )
                .map(a => ({
                  text: a.text,
                  onSelect: () => a.onSelect?.([data]),
                }))}
            />
          </div>
        )}
      </div>
    </>
  );
};

const sortRows = <R extends Row<R>>(
  rows: R[],
  column: Column<R, any, any> | undefined,
  direction: 'desc' | 'asc' | undefined,
  columns: Column<R, any, any>[],
  filters: Record<string, FilterState>,
) => {
  let tmpRows = [...rows];

  if (column) {
    const comparator = (a: R, b: R) => {
      const compareBy = column.compareBy ?? identity;

      let va = compareBy(getColumnValue(column, a));
      let vb = compareBy(getColumnValue(column, b));

      if (direction === 'desc') {
        [va, vb] = [vb, va];
      }

      if (va == vb) {
        return 0;
      }

      if (va < vb) {
        return 1;
      }

      return -1;
    };

    tmpRows = tmpRows.sort(comparator);
  }

  const filter = (row: R) => {
    let modeStrict = false;

    const matches = Object.entries(filters)
      .filter(
        ([, opts]) =>
          (opts.search && opts.search.length > 0) ||
          opts.allowlist.length + opts.blocklist.length > 0,
      )
      .map(([colName, options]) => {
        const column = columns.find(c => c.key === colName);

        if (!column) {
          return true;
        }

        const compareBy = column.compareBy ?? identity;
        const value = getColumnValue(column, row);

        if (options.allowlist.length > 0) {
          modeStrict = true;
        }

        let values = [compareBy(value)];

        if (Array.isArray(value)) {
          values = value.map(compareBy);
        }

        let searchMatch = true;

        if (options.search && options.search !== '') {
          if (
            values.every(
              value =>
                String(value)
                  .toLowerCase()
                  .indexOf(options.search!.toLowerCase()) === -1,
            )
          ) {
            searchMatch = false;
          }
        }

        if (values.some(v => options.allowlist.includes(v))) {
          return searchMatch && true;
        }

        if (values.some(v => options.blocklist.includes(v))) {
          return false;
        }

        return searchMatch;
      });

    if (modeStrict) {
      return matches.every(v => v === true);
    } else {
      return matches.every(v => v !== false);
    }
  };

  return tmpRows.filter(filter);
};

const loadInitialState = (key: string): State => {
  return history.state?.tables?.[key];
};

const saveState = (key: string, state: State) => {
  const newState = produce(history.state, (draft: any) => {
    if (!draft) {
      return { tables: { [key]: state } };
    }

    if (!draft.tables) {
      draft.tables = {};
    }

    draft.tables[key] = state;
  });

  history.replaceState(newState, '', '');
};

const TableContext = createContext<{
  state: State;
  dispatch: Dispatch<Parameters<typeof reducer>[1]>;
  props: TableViewProps<any, any, any>;
  getHeaderRef: (index: number) => (el: HTMLElement | null) => void;
  getCellMeasurerRef: (index: number) => (el: HTMLElement | null) => void;
  setHeaderContainerRef: (el: HTMLElement | null) => void;
  setBodyContainerRef: (el: HTMLElement | null | undefined) => void;
  setColumnWidth: (index: number, width: number) => void;
}>({
  state: {
    sort: null,
    rows: [],
    filters: {},
    columnWidths: {},
  },
  props: {
    columns: [],
    rows: [],
  },
  dispatch: () => {},
  getHeaderRef: () => () => {},
  getCellMeasurerRef: () => () => {},
  setHeaderContainerRef: () => {},
  setBodyContainerRef: () => {},
  setColumnWidth: () => {},
});

const TableProvider = ({
  children,
  ...props
}: PropsWithChildren<TableViewProps<any, any, any>>) => {
  const initialState = useMemo(
    () =>
      (props.persist ? loadInitialState(props.persist) : undefined) ?? {
        sort: props.initialSort
          ? ([
              props.initialSort.column,
              props.initialSort.direction,
            ] as State['sort'])
          : null,
        rows: [],
        filters: {},
        columnWidths: {},
      },
    [props.persist],
  );

  const [state, dispatch] = useReducer(reducer, initialState);
  const headersRef = useRef<(HTMLElement | null)[]>([]);
  const observersRef = useRef<(ResizeObserver | null)[]>([]);
  const headerInitialWidthRef = useRef<(number | null)[]>([]);
  const bodyContainerRef = useRef<HTMLElement>();
  const headerContainerRef = useRef<HTMLElement>();

  const getHeaderRef = useCallback(
    (index: number) => (el: HTMLElement | null) => {
      headersRef.current[index] = el;
      if (!headerInitialWidthRef.current[index]) {
        headerInitialWidthRef.current[index] = el?.clientWidth ?? null;
      }
    },
    [headersRef],
  );

  const setColumnWidth = useCallback(
    (index: number, pWidth: number) => {
      const width = Math.max(
        50,
        headerInitialWidthRef.current[index] ?? 0,
        pWidth,
      );
      const columnIndex = index - (props.selectable ? 1 : 0);
      const column = props.columns[columnIndex].key;

      const sum = headersRef.current
        .map((el, i) =>
          i === index ? width : el?.getClientRects()[0].width ?? 0,
        )
        .reduce((a, b) => a + b, 0);

      const body = bodyContainerRef.current?.getClientRects()[0].width ?? 0;

      dispatch({
        type: 'setColumnSize',
        column,
        width,
      });

      if (sum < body) {
        dispatch({
          type: 'setColumnSize',
          column: props.columns[index + 1 - (props.selectable ? 1 : 0)].key,
          width:
            (headersRef.current[index + 1]?.getClientRects()[0].width ?? 0) +
            (body - sum),
        });
      }
    },
    [headersRef, props, bodyContainerRef, headersRef],
  );

  const getCellMeasurerRef = useCallback(
    (index: number) => (el: HTMLElement | null) => {
      const oldObserver = observersRef.current[index];

      if (oldObserver) {
        oldObserver.disconnect();
      }

      if (el) {
        const observer = (observersRef.current[index] = new ResizeObserver(
          ([entry]) => {
            const headerEl = headersRef.current[index];
            const key = props.columns[index - (props.selectable ? 1 : 0)].key;

            if (headerEl && !state.columnWidths[key]) {
              headerEl.style.width = `${entry.borderBoxSize[0].inlineSize}px`;
            }
          },
        ));

        if (headerInitialWidthRef.current[index] && !el.style.minWidth) {
          el.style.minWidth = `${headerInitialWidthRef.current[index]}px`;
        }

        observer.observe(el);
      }
    },
    [headersRef, observersRef, state.columnWidths],
  );

  const setBodyContainerRef = useCallback(
    (el: HTMLElement | null) => {
      if (el) {
        el.addEventListener('scroll', () => {
          if (headerContainerRef.current) {
            headerContainerRef.current.scrollLeft = el.scrollLeft;
          }
        });
      }
    },
    [headerContainerRef],
  );

  return (
    <TableContext.Provider
      value={{
        state,
        dispatch,
        props,
        getCellMeasurerRef,
        getHeaderRef,
        setHeaderContainerRef: el =>
          (headerContainerRef.current = el ?? undefined),
        setBodyContainerRef: useMergeRefs([
          setBodyContainerRef,
          bodyContainerRef,
        ])!,
        setColumnWidth,
      }}
    >
      {children}
    </TableContext.Provider>
  );
};

export const Table = <
  R extends Row,
  ColumnNames extends string,
  ColumnTypeMap extends Record<ColumnNames, any>,
>(
  props: TableViewProps<R, ColumnNames, ColumnTypeMap>,
) => (
  <TableProvider {...props}>
    <TableInner {...props} />
  </TableProvider>
);

type HeaderProps<Row, Value> = {
  column: Column<Row, any, Value>;
  index: number;
};

const Header = <Row, Value>({ column, index }: HeaderProps<Row, Value>) => {
  const { state, dispatch, getHeaderRef, setColumnWidth } =
    useContext(TableContext);
  const headerElRef = useRef<HTMLDivElement>();
  const [active, setActive] = useState(false);

  const handleMouseDown: React.MouseEventHandler = evt => {
    const startWidth = headerElRef.current?.getBoundingClientRect().width ?? 0;
    const startX = evt.pageX;

    const onMouseMove = (evt: MouseEvent) => {
      setColumnWidth(index, startWidth + evt.pageX - startX);
    };

    const onMouseUp = (evt: MouseEvent) => {
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('mousemove', onMouseMove);
      evt.preventDefault();
      evt.stopPropagation();
      setActive(false);
    };

    setActive(true);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const headerRef = useMergeRefs([getHeaderRef(index), headerElRef]);

  const sort =
    state.sort !== null && state.sort[0] === column.key ? state.sort[1] : null;

  return (
    <div
      role="columnheader"
      key={column.key}
      ref={headerRef}
      style={{
        width: `${state.columnWidths[column.key]}px`,
      }}
      onClick={() =>
        dispatch({
          type: 'cycleSort',
          column: column.key,
        })
      }
      className={`
        relative flex cursor-pointer select-none items-center
        justify-between
        whitespace-nowrap
        px-3 py-2
        text-sm
        font-bold
        text-gray-700
      `}
    >
      {column.name}
      <div className="size-5">
        {sort === 'asc' && <ChevronUp className="h-5 text-gray-400" />}
        {sort === 'desc' && <ChevronDown className="h-5 text-gray-400" />}
      </div>
      <div
        className="group absolute -right-3 z-10 mr-[0px] flex h-full w-6 cursor-col-resize items-center justify-center"
        onMouseDown={handleMouseDown}
        onClick={evt => evt.stopPropagation()}
      >
        <Code
          className={`size-4 ${active ? 'block text-blue-400' : 'hidden text-gray-400 group-hover:block'}`}
        />
      </div>
    </div>
  );
};

const TableHeaders = () => {
  const { props, setHeaderContainerRef, getHeaderRef } =
    useContext(TableContext);

  return (
    <div
      className="sticky top-0 z-10 overflow-hidden rounded-t-md border-b bg-gray-50"
      ref={setHeaderContainerRef}
    >
      <div className="flex w-max min-w-full divide-x">
        {props.selectable && (
          <div className="min-w-[2.5em]" ref={getHeaderRef(0)} />
        )}
        {props.columns.map((column, i) => (
          <Header column={column} index={i + (props.selectable ? 1 : 0)} />
        ))}
        {props.actions && props.actions.length > 0 && (
          <div
            className="min-w-[2.5em]"
            ref={getHeaderRef(
              props.columns.length + (props.selectable ? 1 : 0),
            )}
          />
        )}
      </div>
    </div>
  );
};

export const TableInner = <
  R extends Row,
  ColumnNames extends string,
  ColumnTypeMap extends Record<ColumnNames, any>,
>({
  rows,
  columns,
  selectable,
  actions,
  onRowClick,
  loading,
  showBottomLoading,
  emptyMessage,
  hideTools,
  more,
  fetchMore,
  footer,
  onSortChange,
  onFilterChange,
  refreshing,
  persist,
}: TableViewProps<R, ColumnNames, ColumnTypeMap>) => {
  const { state, dispatch, setBodyContainerRef } = useContext(TableContext);

  const sortedRowsRef = useRef<R[]>([]);

  useEffect(() => {
    if (state.sort) {
      const column = columns.find(c => c.key === state.sort![0])!;
      onSortChange?.(column.key, state.sort[1]);
    } else {
      onSortChange?.();
    }
  }, [state.sort, onSortChange]);

  useEffect(() => {
    onFilterChange?.(state.filters);
  }, [state.filters, onFilterChange]);

  const saveStateDebounced = useMemo(
    () => debounce(saveState, { waitMs: 500 }),
    [],
  );

  useEffect(() => {
    if (persist) {
      saveStateDebounced.call(persist, state);
    }
  }, [persist, state]);

  const selectAllCallbackRef = useRef<{
    fetching: boolean;
    callbacks: Array<
      (args: {
        state: typeof state;
        dispatch: typeof dispatch;
        rows: typeof rows;
      }) => void
    >;
  }>({ fetching: false, callbacks: [] });

  useEffect(() => {
    if (selectAllCallbackRef.current.fetching && !more) {
      selectAllCallbackRef.current.callbacks.forEach(callback =>
        callback({ state, dispatch, rows }),
      );
      selectAllCallbackRef.current.callbacks = [];
      selectAllCallbackRef.current.fetching = false;
    }
  }, [more, dispatch, selectAllCallbackRef, state, dispatch]);

  const fetchAllAnd = async <T,>(
    callback: (args: {
      dispatch: typeof dispatch;
      state: typeof state;
      rows: typeof rows;
    }) => Promise<T> | T,
  ): Promise<T> => {
    if (!more) {
      return callback({ dispatch, state, rows });
    }

    return new Promise<T>(resolve => {
      selectAllCallbackRef.current.callbacks.push(args =>
        Promise.resolve(callback(args)).then(resolve),
      );

      if (!selectAllCallbackRef.current.fetching) {
        fetchMore?.(null);
        selectAllCallbackRef.current.fetching = true;
      }
    });
  };

  const sortedRows = useMemo(() => {
    let result: R[];

    if (!onSortChange) {
      result = sortRows(
        rows,
        columns.find(c => c.key === state.sort?.[0]),
        state.sort?.[1] ?? 'asc',
        columns,
        state.filters,
      );
    } else {
      result = sortRows(rows, undefined, 'asc', columns, state.filters);
    }

    return (sortedRowsRef.current = result);
  }, [rows, state.sort, columns, state.filters]);

  const scrollDetectorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const callback: IntersectionObserverCallback = ([rect]) => {
      if (rect.intersectionRatio === 1 && more) {
        fetchMore?.(30);
      }
    };

    const observer = new IntersectionObserver(callback, {
      threshold: 1.0,
    });

    const el = scrollDetectorRef.current;

    if (!el) {
      return;
    }

    observer.observe(el);

    return () => observer.unobserve(el);
  }, [scrollDetectorRef, fetchMore, more]);

  const availableActions = useMemo(() => {
    if (!actions || actions.length === 0) return [];

    const matches = actions.map(
      a => typeof a.disabled !== 'boolean' || a.disabled === false,
    );

    for (const row of rows) {
      if (!state.rows.includes(row.key)) continue;

      actions.forEach((action, i) => {
        if (typeof action.disabled === 'function') {
          if (action.disabled(row)) {
            matches[i] = false;
          }

          return;
        }
      });
    }

    return matches.flatMap((matches, i) => (matches ? [actions[i]] : []));
  }, [state.rows, actions]);

  const gridTemplateColumns = [];

  if (selectable) {
    gridTemplateColumns.push('2.5em');
  }

  columns.forEach(({ width, key }) =>
    gridTemplateColumns.push(
      state.columnWidths[key]
        ? `${state.columnWidths[key]}px`
        : `minmax(min-content, ${width ?? 'auto'})`,
    ),
  );

  if (actions) {
    gridTemplateColumns.push('2.5em');
  }

  return (
    <div
      role="table"
      className={`table-component relative ${!hideTools && 'pr-[7em]'} ${
        refreshing ? 'refreshing' : ''
      }`}
      data-cy="table-view"
      data-visible-rows={sortedRows.length}
      data-total-rows={rows.length}
    >
      {!hideTools && (
        <div className="absolute bottom-0 right-0 top-0 w-[7em]">
          <div className="sticky top-12 ml-5 mt-12 flex flex-col gap-2">
            <Dropdown
              flat
              keepOpen
              label="Sort"
              options={columns.map(col => ({
                text: (
                  <div
                    className={`flex ${
                      state.sort?.[0] === col.key && 'text-blue-500'
                    } flex-grow items-center justify-between gap-2`}
                  >
                    <span className="flex-grow">{col.name}</span>
                    {(state.sort?.[0] === col.key &&
                      (state.sort[1] === 'asc' ? (
                        <TrendingUp className="h-4" />
                      ) : (
                        <TrendingDown className="h-4" />
                      ))) || <div className="mr-2 size-4" />}
                  </div>
                ),
                value: col.key,
              }))}
              onSelect={(col: string) =>
                dispatch({
                  type: 'cycleSort',
                  column: col,
                })
              }
            />
            {columns.some(col => col.filter) && (
              <Dropdown flat keepOpen label="Filter">
                {columns
                  .filter(col => col.filter)
                  .map(col => (
                    <FilterDropdownItem column={col} rows={rows} />
                  ))}
                <div className="-mx-1 my-1 h-[1px] bg-gray-200" />
                <DropdownItem
                  label="Clear filters"
                  onClick={() => dispatch({ type: 'resetFilters' })}
                />
              </Dropdown>
            )}
            {selectable && (
              <Dropdown
                flat
                label="Actions"
                options={[
                  ...(selectable
                    ? [
                        {
                          text: 'Select all',
                          onSelect: () =>
                            fetchAllAnd(({ dispatch, rows }) =>
                              dispatch({
                                type: 'setSelectedRows',
                                rows: rows.map(r => r.key),
                              }),
                            ),
                        },
                        {
                          text: 'Deselect all',
                          onSelect: () =>
                            dispatch({
                              type: 'clearSelection',
                            }),
                        },
                        {
                          text: 'Reset columns',
                          onSelect: () =>
                            dispatch({ type: 'resetColumnWidths' }),
                        },
                        {
                          text: 'Invert selection',
                          onSelect: () =>
                            fetchAllAnd(({ dispatch, rows }) =>
                              dispatch({
                                type: 'setSelectedRows',
                                rows: rows
                                  .map(r => r.key)
                                  .filter(k => !state.rows.includes(k)),
                              }),
                            ),
                        },
                      ]
                    : []),
                  ...(availableActions.length > 0
                    ? ([
                        { divider: true },
                        ...availableActions.map(a => ({
                          value: a.key,
                          text: a.text,
                          onSelect: () => {
                            a.onSelect?.(
                              state.rows
                                .map(key => sortedRows.find(r => r.key === key))
                                .filter(identity) as R[],
                            );
                          },
                        })),
                      ] as const)
                    : []),
                ]}
              />
            )}
          </div>
        </div>
      )}
      <div className="w-full rounded-md border bg-white shadow-sm">
        <TableHeaders />
        <div
          className="grid min-w-full overflow-x-auto"
          style={{ gridTemplateColumns: gridTemplateColumns.join(' ') }}
          ref={setBodyContainerRef}
        >
          {sortedRows.flatMap((row, i) => (
            <TableRow
              data={row}
              rowIndex={i}
              rowCount={sortedRows.length}
              actions={actions}
              selectable={selectable ?? false}
              onRowClick={onRowClick}
              columns={columns}
            />
          ))}
          <div className="col-span-full" ref={scrollDetectorRef}></div>
          {(loading || showBottomLoading) && (
            <div className="col-span-full flex items-center justify-center border-x border-t border-x-gray-200 border-t-gray-100">
              <Loader className="my-4 mr-2 animate-[spin_3s_linear_infinite] text-blue-600" />
              <span className="text-gray-800">Loading...</span>
            </div>
          )}
          {!loading && rows.length === 0 && (
            <div className="col-span-full flex justify-center px-3 py-2 text-center text-sm">
              <div className="w-[30em] py-3 text-gray-800">
                {emptyMessage ?? 'No rows to display.'}
              </div>
            </div>
          )}
        </div>
        {footer !== false && (
          <div className="sticky bottom-0 flex items-center justify-end gap-3 rounded-b-md border-t bg-gray-50 px-3 py-2">
            {state.rows.length > 0 && (
              <span className="text-sm text-gray-700">
                Selected: {state.rows.length}
              </span>
            )}
            <div className="h-[1.5em] flex-grow" />
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
