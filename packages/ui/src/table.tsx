/* eslint-disable @typescript-eslint/no-explicit-any */

import { identity } from 'fp-ts/lib/function';
import { useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Circle,
  MinusSquare,
  MoreVertical,
  PlusSquare,
  Square,
  TrendingDown,
  TrendingUp,
} from 'react-feather';
import { difference, concat, uniq, pipe, reduce, map } from 'remeda';
import { Dropdown } from './dropdown';
import { FilledDisc } from './filled-disc';

function union<T>(a: T[], b: T[]): T[] {
  return uniq(concat(a, b));
}

const getRowColumnValue = <R extends Record<string, V>, V>(
  column: { getValue: ((row: R) => V) | string },
  row: R,
): V => {
  if (typeof column.getValue === 'string') {
    return row[column.getValue];
  } else {
    return column.getValue(row);
  }
};

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
  getValue: string | ((row: R) => Value);
  render?: (value: Value, row: R, depth: number) => any;
  align?: 'right';
  compareBy?: (value: Value) => any;
};

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
  selectable?: boolean;
  actions?: Array<Action<R>>;
  emptyMessage?: JSX.Element | string;
  hideTools?: boolean;
  footer?: React.ReactNode;
  initialSort?: {
    column: ColumnNames;
    direction: 'asc' | 'desc';
  };
};

const getColumnValue = <R extends Row, Value>(
  column: Column<R, any, Value>,
  row: R,
): Value => {
  if (typeof column.getValue === 'string') {
    return row[column.getValue as keyof R] as Value;
  }

  return column.getValue(row);
};

type FilterState = {
  allowlist: Array<any>;
  blocklist: Array<any>;
};

type FilterDropdownItemProps = {
  column: Column<any, any, any>,
  rows: Row[],
  options: FilterState,
  onChange: (value: FilterState) => void,
}

const FilterDropdownItem = ({ column, rows, options, onChange }: FilterDropdownItemProps) => {
  let containsArrays = false;

  const rowValues: [Row, any][] = rows.flatMap((r: Row): [Row, any][] => {
    const value = getColumnValue(column, r);

    if (Array.isArray(value)) {
      containsArrays = true;
      return value.map(v => [r, v]);
    } else {
      return [[r, value]];
    }
  });

  const compareBy = column.compareBy ?? identity;

  return (
    <Dropdown
      label=""
      scroll
      renderTrigger={props => (
        <div
          {...props}
          className={`flex ${
            options.allowlist.length + options.blocklist.length > 0 &&
            'text-blue-500'
          } items-center ${props.style}`}
        >
          <span className="flex-grow">{column.name}</span>
          <span className="text-gray-400 relative">
            {options.allowlist.length + options.blocklist.length > 0
              ? 'Active'
              : 'Any'}
          </span>
        </div>
      )}
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
        (r) => r.list,
        map(([row, value]) => {
          let icon = null;

          const compareValue = compareBy(value);

          if (options.allowlist.includes(compareValue)) {
            icon = <PlusSquare className="text-green-500 h-4" />;
          } else if (options.blocklist.includes(compareValue)) {
            icon = <MinusSquare className="text-red-500 h-4" />;
          }

          let displayValue = String(value);

          if (column.render) {
            let renderValue = value;

            if (containsArrays && !Array.isArray(renderValue)) {
              renderValue = [value];
            }

            displayValue = column.render(renderValue, row, 0);
          }

          return {
            value,
            text: (
              <div className="flex items-center">
                <span className="flex-grow">{displayValue}</span>
                {icon}
              </div>
            ),
          };
        })
      )}
      onSelect={value => {
        const compareValue = compareBy(value);

        if (options.allowlist.includes(compareValue)) {
          onChange({
            blocklist: union(options.blocklist, [compareValue]),
            allowlist: difference(options.allowlist, [compareValue]),
          });
        } else if (options.blocklist.includes(compareValue)) {
          onChange({
            ...options,
            blocklist: difference(options.blocklist, [compareValue]),
          });
        } else {
          onChange({
            ...options,
            allowlist: union(options.allowlist, [compareValue]),
          });
        }
      }}
    />
  );
};

type TableRowProps<R extends Row> = {
  data: R,
  depth?: number,
  selectedRows: any[],
  rowIndex: number,
  rowCount: number,
  expandedRows: any[],
  onRowClick?: (data: R) => void,
  toggleSelection: (key: R['key']) => void,
  toggleRowExpanded: (key: R['key']) => void,
  sorting: [string, 'asc' | 'desc'] | null,
  filters: Record<string, FilterState>,
  selectable: boolean,
  columns: Column<any, any, any>[],
  actions?: Action<any>[],
}

const TableRow = <R extends Row>({
  data,
  selectable,
  depth = 0,
  selectedRows,
  onRowClick,
  rowIndex,
  rowCount,
  toggleSelection,
  columns,
  actions,
  expandedRows,
  toggleRowExpanded,
  filters,
  sorting,
}: TableRowProps<R>) => {
  const selected = selectedRows.includes(data.key);

  const children = useMemo(() => data?.children ?? [], [data]);

  const sortedChildren = useMemo(
    () =>
      sortRows(
        children,
        columns.find(c => c.name === sorting?.[0])!,
        sorting?.[1],
        columns,
        filters,
      ),
    [children, sorting, columns, filters],
  );

  return (
    <>
      <div
        className="contents"
        onClick={() => (
          onRowClick && onRowClick(data),
          toggleRowExpanded(data.key)
        )}
      >
        {selectable && (
          <div
            className={`
              border-l border-b-gray-100 relative px-3 py-2 flex items-center justify-center
              ${rowIndex < rowCount - 1 && 'border-b'}
            `}
          >
            <button
              onClick={evt => {
                toggleSelection(data.key);
                evt.stopPropagation();
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
          </div>
        )}
        {columns.map((column, columnIndex) => {
          const value = getRowColumnValue(column, data);
          let content = value;

          if (column.render) {
            content = column.render(value, data, depth);
          }

          return (
            <div
              key={column.name}
              data-row={rowIndex}
              data-column={column.name}
              className={`
                  whitespace-nowrap
                  overflow-hidden
                  min-w-0
                  flex
                  items-center
                  relative
                  px-3
                  py-2
                  border-b-gray-100
                  border-l
                  ${
                    !actions && columnIndex === columns.length - 1 && 'border-r'
                  }
                  ${rowIndex < rowCount - 1 && 'border-b'}
                  ${(columnIndex > 0 || selectable) && 'border-l-gray-100'}
                  ${onRowClick && 'cursor-pointer'}
                  ${column.align === 'right' && 'justify-end'}
                `}
            >
              {content}
            </div>
          );
        })}
        {actions && (
          <div
            className={`
              border-b-gray-100 border-l-gray-100 border-l border-r relative px-2 py-2 flex items-center justify-center
              ${rowIndex < rowCount - 1 && 'border-b'}
            `}
          >
            <Dropdown
              renderTrigger={props => (
                <button {...props}>
                  <MoreVertical />
                </button>
              )}
              showArrow={false}
              className="h-[24px]"
              options={actions
                .filter(a =>
                  typeof a.disabled === 'function'
                    ? !a.disabled(data)
                    : !a.disabled,
                )
                .map(a => ({ ...a, onSelect: () => a.onSelect?.([data]) }))}
            />
          </div>
        )}
      </div>
      {expandedRows.includes(data.key) &&
        sortedChildren.map(childData => (
          <TableRow
            key={childData.key}
            data={childData}
            depth={depth + 1}
            rowIndex={1}
            rowCount={3}
            actions={actions}
            selectable={selectable}
            selectedRows={selectedRows}
            toggleSelection={toggleSelection}
            onRowClick={onRowClick}
            columns={columns}
            expandedRows={expandedRows}
            toggleRowExpanded={toggleRowExpanded}
            filters={filters}
            sorting={sorting}
          />
        ))}
    </>
  );
};

const sortRows = <R extends Row<R>>(
  rows: R[],
  column: Column<R, any, any>,
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
      .filter(([, opts]) => opts.allowlist.length + opts.blocklist.length > 0)
      .map(([colName, options]) => {
        const column = columns.find(c => c.name === colName);

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

        if (values.some(v => options.allowlist.includes(v))) {
          return true;
        }

        if (values.some(v => options.blocklist.includes(v))) {
          return false;
        }
      });

    if (modeStrict) {
      return matches.every(v => v === true);
    } else {
      return matches.every(v => v !== false);
    }
  };

  return tmpRows.filter(filter);
};

export const Table = <
  R extends Row,
  ColumnNames extends string,
  ColumnTypeMap extends Record<ColumnNames, any>,
>({
  rows,
  columns,
  selectable,
  actions,
  onRowClick,
  emptyMessage,
  hideTools,
  footer,
  initialSort,
}: TableViewProps<R, ColumnNames, ColumnTypeMap>) => {
  const [selectedRows, setSelectedRows] = useState<Array<string | number>>([]);
  const [sorting, setSorting] = useState<[ColumnNames, 'asc' | 'desc'] | null>(
    initialSort ? [initialSort.column, initialSort.direction] : null,
  );
  const [filters, setFilters] = useState<Record<string, FilterState>>({});
  const [expandedRows, setExpandedRows] = useState<unknown[]>([]);

  const sortedRows = useMemo(
    () =>
      sortRows(
        rows,
        columns.find(c => c.name === sorting?.[0])!,
        sorting?.[1] ?? 'asc',
        columns,
        filters,
      ),
    [rows, sorting, columns, filters],
  );

  const toggleSelection = (row: Row['key']) => {
    const newSet = [...selectedRows];
    const index = selectedRows.indexOf(row);

    if (index > -1) {
      newSet.splice(index, 1);
    } else {
      newSet.push(row);
    }

    setSelectedRows(newSet);
  };

  const toggleRowExpanded = (row: Row['key']) => {
    const newSet = [...expandedRows];
    const index = expandedRows.indexOf(row);

    if (index > -1) {
      newSet.splice(index, 1);
    } else {
      newSet.push(row);
    }

    setExpandedRows(newSet);
  };

  const columnCount = columns.length;

  const availableActions = useMemo(() => {
    if (!actions || actions.length === 0) return [];

    const matches = actions.map(
      a => typeof a.disabled !== 'boolean' || a.disabled === false,
    );

    for (const row of rows) {
      if (!selectedRows.includes(row.key)) continue;

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
  }, [selectedRows, actions]);

  const handleColumnHeaderClick = (column: Column<any, any, any>) => {
    if (!sorting || sorting[0] !== column.name) {
      setSorting([column.name, 'desc']);
    } else if (sorting[1] === 'desc') {
      setSorting([column.name, 'asc']);
    } else {
      setSorting(null);
    }
  };

  return (
    <div
      className="relative"
      data-cy="table-view"
      data-visible-rows={sortedRows.length}
      data-total-rows={rows.length}
    >
      {!hideTools && (
        <div className="absolute top-0 bottom-0 right-0 w-0">
          <div className="flex flex-col gap-2 ml-5 mt-12 sticky top-12">
            <Dropdown
              label="Sort"
              options={columns.map(col => ({
                text: (
                  <div
                    className={`flex ${
                      sorting?.[0] === col.name && 'text-blue-500'
                    } items-center`}
                  >
                    <span className="flex-grow">{col.name}</span>
                    {sorting?.[0] === col.name &&
                      (sorting[1] === 'asc' ? (
                        <TrendingUp className="h-4" />
                      ) : (
                        <TrendingDown className="h-4" />
                      ))}
                  </div>
                ),
                value: col.name,
              }))}
              onSelect={(col: string) => {
                if (!sorting || sorting[0] !== col) {
                  setSorting([col as ColumnNames, 'desc']);
                } else if (sorting[1] === 'desc') {
                  setSorting([col as ColumnNames, 'asc']);
                } else {
                  setSorting(null);
                }
              }}
            />
            <Dropdown
              label="Filter"
              options={[
                ...columns.map(col => ({
                  text: (
                    <FilterDropdownItem
                      column={col}
                      rows={rows}
                      options={
                        filters[col.name] ?? { allowlist: [], blocklist: [] }
                      }
                      onChange={options =>
                        setFilters(prev => ({ ...prev, [col.name]: options }))
                      }
                    />
                  ),
                  value: col.name,
                })),
                { divider: true },
                {
                  text: (
                    <div className="flex items-center gap-1 -ml-2">
                      <Square className="h-4 text-gray-500" /> TKO-äly member
                    </div>
                  ),
                },
              ]}
            />
            <Dropdown
              label="Actions"
              options={[
                {
                  text: 'Select all',
                  onSelect: () => setSelectedRows(sortedRows.map(r => r.key)),
                },
                { text: 'Deselect all', onSelect: () => setSelectedRows([]) },
                {
                  text: 'Invert selection',
                  onSelect: () =>
                    setSelectedRows(
                      sortedRows
                        .filter(r => !selectedRows.includes(r.key))
                        .map(r => r.key),
                    ),
                },
                ...(availableActions.length > 0
                  ? [
                      { divider: true },
                      ...availableActions.map(a => ({
                        ...a,
                        onSelect: () =>
                          a.onSelect?.(
                            selectedRows
                              .map(key => sortedRows.find(r => r.key === key))
                              .filter(identity) as R[],
                          ),
                      })),
                    ]
                  : []),
              ]}
            />
          </div>
        </div>
      )}
      <div className="bg-white shadow-sm">
        <div
          className="grid"
          style={{
            gridTemplateColumns: `${
              selectable ? 'min-content ' : ''
            }repeat(${columnCount}, auto)${actions ? ' min-content' : ''}`,
          }}
        >
          {selectable && (
            <div className="sticky top-0 z-10 rounded-tl-md border-l border-t border-b bg-gray-50" />
          )}
          {columns.map((column, i) => (
            <div
              key={column.name}
              onClick={() => handleColumnHeaderClick(column)}
              className={`
                ${!selectable && i == 0 && 'rounded-tl-md border-l'}
                ${
                  !actions &&
                  i == columns.length - 1 &&
                  'rounded-tr-md border-r'
                }
                border-l
                border-t sticky top-0 z-10 text-gray-700 px-3 py-2
                bg-gray-50 border-b text-sm font-bold
                cursor-pointer
                flex items-center
                justify-between
              `}
            >
              {column.name}
              {sorting !== null &&
                sorting[0] === column.name &&
                sorting[1] === 'asc' && (
                  <ChevronUp className="h-5 text-gray-400" />
                )}
              {sorting !== null &&
                sorting[0] === column.name &&
                sorting[1] === 'desc' && (
                  <ChevronDown className="h-5 text-gray-400" />
                )}
            </div>
          ))}
          {actions && (
            <div className="sticky rounded-tr-md border-t top-0 z-10 bg-gray-50 border-b border-l border-r" />
          )}
          {sortedRows.flatMap((row, i) => (
            <TableRow
              data={row}
              rowIndex={i}
              rowCount={sortedRows.length}
              actions={actions}
              selectable={selectable ?? false}
              selectedRows={selectedRows}
              toggleSelection={toggleSelection}
              onRowClick={onRowClick}
              columns={columns}
              expandedRows={expandedRows}
              toggleRowExpanded={toggleRowExpanded}
              filters={filters}
              sorting={sorting}
            />
          ))}
          {rows.length === 0 && (
            <div className="col-span-full py-2 px-3 text-center text-sm flex justify-center">
              <div className="w-[30em] text-gray-800 py-3">
                {emptyMessage ?? 'No rows to display.'}
              </div>
            </div>
          )}
        </div>
        {footer !== false && (
          <div className="sticky bottom-0 border rounded-b-md py-2 px-3 flex justify-end gap-3 bg-gray-50 border-t items-center">
            {selectedRows.length > 0 && (
              <span className="text-sm text-gray-700">
                Selected: {selectedRows.length}
              </span>
            )}
            <div className="flex-grow h-[1.5em]" />
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
