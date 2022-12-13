/* eslint-disable @typescript-eslint/no-explicit-any */

import { identity } from 'fp-ts/lib/function';
import { useMemo, useState } from 'react';
import { Circle, MinusSquare, MoreVertical, PlusSquare, Square, TrendingDown, TrendingUp } from 'react-feather';
import { difference, concat, uniq } from 'remeda';
import { Dropdown } from './dropdown';
import { FilledDisc } from './filled-disc';

function union<T>(a: T[], b: T[]): T[] {
  return uniq(concat(a, b));
}

const getRowColumnValue = <R, V>(column: { getValue: ((row: R) => V) | string }, row: R): V => {
  if (typeof column.getValue === 'string') {
    return row[column.getValue];
  } else {
    return column.getValue(row);
  }
};

export type Row = { key: string | number }

export type Action<R> = {
  key: string,
  text: string,
  rowWise?: boolean,
  disabled?: boolean | ((r: R) => boolean),
  onSelect?: (rows: Array<R>) => void
}

export type Column<R, Name extends string, Value> = {
  name: Name,
  getValue: string | ((row: R) => Value),
  render?: (value: Value, row: R) => any,
  align?: 'right',
  compareBy?: (value: Value) => any,
}

export type TableViewProps<R extends Row, ColumnNames extends string, ColumnTypeMap extends Record<ColumnNames, Column<R, any, any>>> = {
  rows: R[],
  columns: Array<{ [Name in ColumnNames]: Column<R, Name, ColumnTypeMap[Name]> }[ColumnNames]>,
  onRowClick?: (row: R) => void,
  selectable?: boolean,
  actions?: Array<Action<R>>,
  emptyMessage?: JSX.Element | string,
}

const getColumnValue = <R extends Row, Value>(column: Column<R, any, Value>, row: R): Value => {
  if (typeof column.getValue === 'string') {
    return row[column.getValue];
  }

  return column.getValue(row);
};

type FilterState = {
  allowlist: Array<any>,
  blocklist: Array<any>,
}

const FilterDropdownItem = ({ column, rows, options, onChange }) => {
  let containsArrays = false;

  const rowValues =
    rows
      .flatMap((r: Row) => {
        const value = getColumnValue(column, r);

        if (Array.isArray(value)) {
          containsArrays = true;
          return value.map((v) => [r, v]);
        } else {
          return [[r, value]];
        }
      });

  const compareBy = column.compareBy ?? identity;

  return (
    <Dropdown
      label=''
      scroll
      renderTrigger={(props) => (
        <div {...props} className={`flex ${(options.allowlist.length + options.blocklist.length > 0) && 'text-blue-500'} items-center ${props.style}`}>
          <span className="flex-grow">{column.name}</span>
          <span className="text-gray-400 relative">
            {(options.allowlist.length + options.blocklist.length > 0) ? 'Active' : 'Any'}
          </span>
        </div>
      )}
      options={
        rowValues
          .reduce(([list, values]: [any[], Set<string>], [row, value]: [any, string]) => {
            if (values.has(compareBy(value))) {
              return [list, values];
            } else {
              values.add(compareBy(value));
              return [[...list, [row, value]], values];
            }
          }, [[], new Set()])[0]
          .map(([row, value]) => {
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

              displayValue = column.render(renderValue, row);
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
      }
      onSelect={(value) => {
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

export const TableView = <R extends Row, ColumnNames extends string, ColumnTypeMap extends Record<ColumnNames, any>>({ rows, columns, selectable, actions, onRowClick, emptyMessage }: TableViewProps<R, ColumnNames, ColumnTypeMap>) => {
  const [selectedRows, setSelectedRows] = useState<Array<string | number>>([]);
  const [sorting, setSorting] = useState(null);
  const [filters, setFilters] = useState<Record<string, FilterState>>({});

  const sortedRows = useMemo(() => {
    let tmpRows = [...rows];

    if (sorting) {
      const [sortCol, sortDir] = sorting;

      const column = columns.find(c => c.name === sortCol);

      if (!column) {
        setSorting(null);
        return rows;
      }

      const comparator = (a: R, b: R) => {
        const compareBy = column.compareBy ?? identity;

        let va = compareBy(getColumnValue(column, a));
        let vb = compareBy(getColumnValue(column, b));

        if (sortDir === 'desc') {
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
  }, [rows, sorting, columns, filters]);

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

  const columnCount = columns.length;

  const availableActions = useMemo(() => {
    if (!actions || actions.length === 0)
      return [];

    const matches = actions.map(a => typeof a.disabled !== 'boolean' || a.disabled === false);

    for (const row of rows) {
      if (!selectedRows.includes(row.key))
        continue;

      actions.forEach((action, i) => {
        if (typeof action.disabled === 'function') {
          if (action.disabled(row)) {
            matches[i] = false;
          }

          return;
        }
      });
    }

    return matches.flatMap((matches, i) => matches ? [actions[i]] : []);
  }, [selectedRows, actions]);

  return (
    <div className="relative pt-5" data-cy="table-view" data-visible-rows={sortedRows.length} data-total-rows={rows.length}>
      <div className="absolute left-full ml-2 w-60 flex flex-col gap-2 p-3">
        <Dropdown
          label="Sort"
          options={columns.map((col) => ({
            text: (
              <div className={`flex ${sorting?.[0] === col.name && 'text-blue-500'} items-center`}>
                <span className="flex-grow">{col.name}</span>
                {sorting?.[0] === col.name && (
                  sorting[1] === 'asc'
                    ? <TrendingUp className="h-4" />
                    : <TrendingDown className="h-4" />
                )}
              </div>
            ),
            value: col.name,
          }))}
          onSelect={(col) => {
            if (!sorting || sorting[0] !== col) {
              setSorting([col, 'desc']);
            } else if (sorting[1] === 'desc') {
              setSorting([col, 'asc']);
            } else {
              setSorting(null);
            }
          }}
        />
        <Dropdown
          label="Filter"
          options={[
            ...columns.map((col) => ({
              text: <FilterDropdownItem
                column={col}
                rows={rows}
                options={filters[col.name] ?? { allowlist: [], blocklist: [] }}
                onChange={(options) => setFilters((prev) => ({ ...prev, [col.name]: options }))}
              />,
              value: col.name,
            })),
            { divider: true },
            { text: (<div className="flex items-center gap-1 -ml-2"><Square className="h-4 text-gray-500" /> TKO-äly member</div>) },
          ]}
        />
        <Dropdown
          label="Actions"
          options={[
            { text: 'Select all', onSelect: () => setSelectedRows(sortedRows.map(r => r.key)) },
            { text: 'Deselect all', onSelect: () => setSelectedRows([]) },
            { text: 'Invert selection', onSelect: () => setSelectedRows(sortedRows.filter(r => !selectedRows.includes(r.key)).map(r => r.key)) },
            ...(
              availableActions.length > 0
                ? [{ divider: true }, ...availableActions.map(a => ({ ...a, onSelect: () => a.onSelect(selectedRows.map(key => sortedRows.find(r => r.key === key)).filter(identity)) }))]
                : []
            ),
          ]}
        />
      </div>
      <div className="grid bg-white border rounded-md shadow-sm" style={{ gridTemplateColumns: `${selectable ? 'min-content ' : ''}repeat(${columnCount}, auto)${actions ? ' min-content' : ''}` }}>
        {selectable && <div />}
        {columns.map((column) => (
          <div className="relative h-0" key={column.name}>
            <div className={`absolute ${column.align === 'right' ? 'right-3' : 'left-3'} pb-1 text-xs font-bold text-gray-500 bottom-full`}>{column.name}</div>
            <div className={`opacity-0 pointer-events-none ${column.align === 'right' ? 'pr-3' : 'pl-3'} pb-1 text-xs font-bold text-gray-500 bottom-full`}>{column.name}</div>
          </div>
        ))}
        {actions && <div />}
        {
          sortedRows.flatMap((row, i) => {

            return (
              <div className="contents" onClick={() => (console.log('aAAA'), onRowClick && onRowClick(row))}>
                {selectable && (
                  <div className={`${i > 0 && 'border-t'} relative pl-3 py-2 flex items-center justify-center`}>
                    <button onClick={(evt) => {
                      toggleSelection(row.key);
                      evt.stopPropagation();
                    }}>
                      {
                        selectedRows.includes(row.key)
                          ? <FilledDisc className="text-blue-500" style={{ width: '1em', strokeWidth: '2.5px' }} />
                          : <Circle className="text-gray-400" style={{ width: '1em', strokeWidth: '2.5px' }} />
                      }
                    </button>
                  </div>
                )}
                {
                  columns.map((column) => {
                    const value = getRowColumnValue(column, row);
                    let content = value;

                    if (column.render) {
                      content = column.render(value, row);
                    }

                    return (
                      <div className={`${i > 0 && 'border-t'} whitespace-nowrap overflow-hidden ${onRowClick && 'cursor-pointer'} min-w-0 flex ${column.align === 'right' ? 'justify-end' : ''} items-center relative px-3 py-2`} key={column.name} data-row={i} data-column={column.name}>
                        {content}
                      </div>
                    );
                  })
                }
                {actions && (
                  <div className={`${i > 0 && 'border-t'} relative px-3 py-2 flex items-center justify-center`}>
                    <Dropdown
                      renderTrigger={(props) => <button {...props}><MoreVertical /></button>}
                      showArrow={false}
                      className="h-[24px]"
                      options={actions.filter(a => typeof a.disabled === 'function' ? !a.disabled(row) : !a.disabled).map(a => ({ ...a, onSelect: () => a.onSelect([row]) }))}
                    />
                  </div>
                )}
              </div>
            );
          })
        }
        { rows.length === 0 && (
          <div className="col-span-full py-2 px-3 text-center text-sm flex justify-center">
            <div className="w-[30em] text-gray-800 py-3">
              { emptyMessage ?? 'No rows to display.' }
            </div>
          </div>
        ) }
      </div>
    </div>
  );
};

