import { createSelector } from "@reduxjs/toolkit"
import { format, parseISO } from "date-fns"
import { useEffect, useState } from "react"
import debtApi from "../api/debt"
import debtCentersApi from "../api/debt-centers"
import payersApi from "../api/payers"
import paymentsApi from "../api/payments"
import { useAppDispatch, useAppSelector } from "../store"
import { useDialog } from "./dialog"
import { GlobalSearchDialog } from "./dialogs/global-search-dialog"
import 'react-popper-tooltip/dist/styles.css';
import { usePopperTooltip } from 'react-popper-tooltip'
import { formatEuro } from "../../common/currency"
import { useFetchResourceDetails } from "../hooks/use-fetch-resource-details"

export type Props = {
  type?: string,
  onChange: (evt: { target: { value: { type: string, id: string } } }, resource: { type: string, id: string }) => void,
}

export const ResourceSelectField = (props: Props) => {
  const showSearchDialog = useDialog(GlobalSearchDialog)
  const [selected, setSelected] = useState(null)
  const { visible, getTooltipProps, getArrowProps, setTriggerRef, setTooltipRef } = usePopperTooltip({ interactive: true, followCursor: false, placement: 'top', delayShow: 300, offset: [0, 0] })
  const resourceDetails = useFetchResourceDetails(selected?.type, selected?.id, !selected)

  const handleOpen = async () => {
    const result = await showSearchDialog({
      type: props.type,
      title: props.type ? `Select a ${props.type.replace('_', ' ')}` : 'Select a resource',
    })

    if (result !== null) {
      setSelected(result);
      props?.onChange?.({ target: { value: result } }, result);
    }
  }

  return (
    <div>
      <div
        ref={setTriggerRef}
        className="bg-white w-80 cursor-pointer flex items-center px-2 w-full border rounded-md shadow-sm inline-block border-gray-200"
        style={{ height: '42px' }}
        onClick={() => handleOpen()}
      >
        {selected && (
          <>
            <span className="py-0.5 px-1.5 rounded-[2pt] bg-blue-500 text-xs font-bold text-white mr-3 capitalize">{selected.type.replace(/_/g, ' ')}</span>
            <span>{resourceDetails?.name}</span>
          </>
        )}
        {!selected && (
          <span className="text-gray-700">{props.type ? `Select a ${props.type.replace('_', ' ')}...` : 'Select a resource...'}</span>
        )}
      </div>
      {visible && selected && resourceDetails && (
        <div ref={setTooltipRef} {...getTooltipProps({ className: 'py-1' })}>
          <div className="rounded-md border border-gray-200 shadow-md bg-white z-10 p-2">
            <table className="text-sm">
              <tr>
                <td colSpan={2}>
                  <div className="flex items-center mb-2">
                    <span className="py-0.5 px-1.5 rounded-[2pt] bg-blue-500 text-xs font-bold text-white mr-2 capitalize">{resourceDetails.type.replace(/_/g, ' ')}</span>
                    <span>{resourceDetails.name}</span>
                  </div>
                </td>
              </tr>
              {
                (resourceDetails.details ?? []).map(([label, value]) => (
                  <tr>
                    <th className="text-left text-gray-700 pr-2">{label}</th>
                    <td>{value}</td>
                  </tr>
                ))
              }
            </table>
          </div>
          <div {...getArrowProps()}>
            <div className="w-2 h-2 bg-white absolute border-r border-b border-gray-200" style={{ marginTop: '-1px', transform: 'rotate(45deg) translate(-50%, 0%)' }} />
          </div>
        </div>
      )}
    </div>
  )
}
