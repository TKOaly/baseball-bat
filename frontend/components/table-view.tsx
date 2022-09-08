import { identity, pipe } from 'fp-ts/lib/function';
import { useMemo, useState } from 'react'
import { Circle, MinusSquare, MoreVertical, PlusSquare, Square, TrendingDown, TrendingUp } from 'react-feather'
import { difference, concat, uniq } from 'remeda';
import { Dropdown } from './dropdown'
import { FilledDisc } from './filled-disc';

const union = <T extends unknown>(a: T[], b: T[]): T[] => uniq(concat(a, b))

const getRowColumnValue = <R, V>(column: { getValue: ((row: R) => V) | string }, row: R): V => {
  if (typeof column.getValue === 'string') {
    return row[column.getValue];
  } else {
    return column.getValue(row);
  }
}

export type Row = { key: string | number }

export type Action<R> = {
  key: string,
  text: string,
  rowWise?: boolean,
  disabled?: boolean | ((r: R) => boolean),
  onSelect?: (rows: Array<R>) => void
}

export type Column<R> = {
  name: string,
  getValue: string | ((row: R) => any),
  render?: (value: any, row: R) => any,
  align?: 'right',
}

export type TableViewProps<R extends Row> = {
  rows: R[],
  columns: Column<R>[],
  onRowClick?: (row: R) => void,
  selectable?: boolean,
  actions?: Array<Action<R>>,
}

const getColumnValue = <R extends Row>(column: Column<R>, row: R) => {
  if (typeof column.getValue === 'string') {
    return row[column.getValue]
  }

  console.log(column.getValue(row))

  return column.getValue(row)
}

type FilterState = {
  allowlist: Array<any>,
  blocklist: Array<any>,
}

const FilterDropdownItem = ({ column, rows, options, onChange }) => {
  return (
    <Dropdown
      label=''
      scroll
      renderTrigger={(props) => (
        <div className={`flex ${(options.allowlist.length + options.blocklist.length > 0) && 'text-blue-500'} items-center`} {...props}>
          <span className="flex-grow">{column.name}</span>
          <span className="text-gray-400 relative">
            {(options.allowlist.length + options.blocklist.length > 0) ? 'Active' : 'Any'}
          </span>
        </div>
      )}
      options={
        uniq(rows.map((r) => [r, getColumnValue(column, r)]))
          .map(([row, value]) => {
            let icon = null

            if (options.allowlist.includes(value)) {
              icon = <PlusSquare className="text-green-500 h-4" />;
            } else if (options.blocklist.includes(value)) {
              icon = <MinusSquare className="text-red-500 h-4" />;
            }

            let displayValue = String(value)

            if (column.render) {
              displayValue = column.render(value, row)
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
        if (options.allowlist.includes(value)) {
          onChange({
            blocklist: union(options.blocklist, [value]),
            allowlist: difference(options.allowlist, [value]),
          })
        } else if (options.blocklist.includes(value)) {
          onChange({
            ...options,
            blocklist: difference(options.blocklist, [value]),
          })
        } else {
          onChange({
            ...options,
            allowlist: union(options.allowlist, [value]),
          })
        }
      }}
    />
  )
}

export const TableView = <R extends Row>({ rows, columns, selectable, actions, onRowClick }: TableViewProps<R>) => {
  const [selectedRows, setSelectedRows] = useState<Array<string | number>>([])
  const [sorting, setSorting] = useState(null)
  const [filters, setFilters] = useState<Record<string, FilterState>>({})

  const sortedRows = useMemo(() => {
    let tmpRows = [...rows]

    if (sorting) {
      const [sortCol, sortDir] = sorting

      const column = columns.find(c => c.name === sortCol)

      if (!column) {
        setSorting(null)
        return rows
      }

      const comparator = (a: R, b: R) => {
        let va = getColumnValue(column, a)
        let vb = getColumnValue(column, b)

        if (sortDir === 'desc') {
          [va, vb] = [vb, va]
        }

        if (va == vb) {
          return 0
        }

        if (va < vb) {
          return 1
        }

        return -1
      }

      tmpRows = tmpRows.sort(comparator)
    }

    const filter = (row: R) => {
      let modeStrict = false

      const matches = Object.entries(filters)
        .filter(([, opts]) => opts.allowlist.length + opts.blocklist.length > 0)
        .map(([colName, options]) => {
          const column = columns.find(c => c.name === colName);
          const value = getColumnValue(column, row);

          if (options.allowlist.length > 0) {
            modeStrict = true
          }

          if (options.allowlist.includes(value)) {
            return true;
          }

          if (options.blocklist.includes(value)) {
            return false;
          }
        })

      if (modeStrict) {
        return matches.every(v => v === true)
      } else {
        return matches.every(v => v !== false)
      }
    }

    return tmpRows.filter(filter)
  }, [rows, sorting, columns, filters])

  const toggleSelection = (row: Row['key']) => {
    const newSet = [...selectedRows]
    const index = selectedRows.indexOf(row)

    if (index > -1) {
      newSet.splice(index, 1)
    } else {
      newSet.push(row)
    }

    setSelectedRows(newSet)
  }

  const columnCount = columns.length;

  const availableActions = useMemo(() => {
    if (!actions || actions.length === 0)
      return []

    const matches = actions.map(a => typeof a.disabled !== 'boolean' || a.disabled === false)

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
      })
    }

    return matches.flatMap((matches, i) => matches ? [actions[i]] : [])
  }, [selectedRows, actions])

  return (
    <div className="relative">
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
              setSorting([col, 'desc'])
            } else if (sorting[1] === 'desc') {
              setSorting([col, 'asc'])
            } else {
              setSorting(null)
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
            { text: (<div className="flex items-center gap-1 -ml-2"><Square className="h-4 text-gray-500" /> TKO-äly member</div>) }
          ]}
          onSelect={() => { }}
        />
        <Dropdown
          label="Actions"
          onSelect={() => { }}
          options={[
            { text: 'Select all', onSelect: () => setSelectedRows(sortedRows.map(r => r.key)) },
            { text: 'Deselect all', onSelect: () => setSelectedRows([]) },
            { text: 'Invert selection', onSelect: () => setSelectedRows(sortedRows.filter(r => !selectedRows.includes(r.key)).map(r => r.key)) },
            ...(
              availableActions.length > 0
                ? [{ divider: true }, ...availableActions.map(a => ({ ...a, onSelect: () => a.onSelect(selectedRows.map(key => sortedRows.find(r => r.key === key)).filter(identity)) }))]
                : []
            )
          ]}
        />
      </div>
      <div className="grid bg-white border rounded-md shadow-sm mt-5" style={{ gridTemplateColumns: `${selectable ? 'min-content ' : ''}repeat(${columnCount}, auto)${actions ? ' min-content' : ''}` }}>
        {selectable && <div />}
        {columns.map((column) => (
          <div className="relative">
            <div className={`absolute ${column.align === 'right' ? 'right-3' : 'left-3'} pb-1 text-sm font-bold text-gray-500 bottom-full`}>{column.name}</div>
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
                    const value = getRowColumnValue(column, row)
                    let content = value

                    if (column.render) {
                      content = column.render(value, row)
                    }

                    return (
                      <div className={`${i > 0 && 'border-t'} overflow-hidden ${onRowClick && 'cursor-pointer'} min-w-0 flex ${column.align === 'right' ? 'justify-end' : ''} items-center relative px-3 py-2`}>
                        {content}
                      </div>
                    )
                  })
                }
                {actions && (
                  <div className={`${i > 0 && 'border-t'} relative px-3 py-2 flex items-center justify-center`}>
                    <Dropdown
                      onSelect={() => { }}
                      label={<MoreVertical />}
                      showArrow={false} className="h-[24px]"
                      options={actions.filter(a => typeof a.disabled === 'function' ? !a.disabled(row) : !a.disabled).map(a => ({ ...a, onSelect: () => a.onSelect([row]) }))}
                    />
                  </div>
                )}
              </div>
            )
          })
        }
      </div>
    </div>
  )
}

