import { useState } from 'react'
import { Circle, MoreVertical, Square, TrendingDown, TrendingUp } from 'react-feather'
import { Dropdown } from './dropdown'

const getRowColumnValue = <R, V>(column: { getValue: ((row: R) => V) | string }, row: R): V => {
  if (typeof column.getValue === 'string') {
    return row[column.getValue];
  } else {
    return column.getValue(row);
  }
}


export const TableView = ({ rows, columns, selectable, actions }) => {
  const [selectedRows, setSelectedRows] = useState([])
  const [sorting, setSorting] = useState(null)

  const toggleSelection = (row) => {
    const newSet = [...selectedRows]
    const index = selectedRows.indexOf(row)

    if (index > -1) {
      newSet.splice(index, 1)
    } else {
      newSet.push(row)
    }

    setSelectedRows(newSet)
  }

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
              text: (
                <div className={`flex ${sorting?.[0] === col.key && 'text-blue-500'} items-center`}>
                  <span className="flex-grow">{col.name}</span>
                  <span className="text-gray-400">Any</span>
                </div>
              ),
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
            { text: 'Select all 123', onSelect: () => setSelectedRows(rows.map(row => row.key)) },
            { text: 'Deselect all' },
            { text: 'Invert selection' },
            { divider: true },
            { text: 'Publish selected' },
            { text: 'Send reminder' },
          ]}
        />
      </div>
      <div className="grid bg-white border rounded-md shadow-sm mt-5" style={{ gridTemplateColumns: `${selectable ? 'min-content ' : ''}repeat(${columns.length}, auto) min-content` }}>
        {
          rows.flatMap((row, i) => (
            <div className="contents" onClick={console.log.bind(console)}>
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
                    <div className={`${i > 0 && 'border-t'} flex ${column.align === 'right' ? 'justify-end' : ''} items-center relative px-3 py-2`}>
                      {i === 0 && <div className="absolute left-3 pb-1 text-sm font-bold text-gray-500 bottom-full">{column.name}</div>}
                      {content}
                    </div>
                  )
                })
              }
              <div className={`${i > 0 && 'border-t'} relative px-3 py-2 flex items-center justify-center`}>
                <Dropdown
                  onSelect={() => { }}
                  label={<MoreVertical />}
                  showArrow={false} className="h-[24px]"
                  options={actions(row)}
                />
              </div>
            </div>
          ))
        }
      </div>
    </div>
  )
}

