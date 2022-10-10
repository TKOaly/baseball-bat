import { DialogBase, DialogContent, DialogFooter, DialogHeader } from '../../components/dialog'
import { Button } from '../../components/button'
import { TextField } from '../text-field'
import { useSearchQuery } from '../../api/search'
import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'wouter'
import { Dropdown } from '../dropdown'

export const GlobalSearchDialog = ({ onClose }) => {
  const [term, setTerm] = useState('')
  const [type, setType] = useState(undefined)
  const { data: results, isLoading } = useSearchQuery({ term, type }, { skip: term === '' })
  const [, setLocation] = useLocation()
  const inputRef = useRef<HTMLInputElement>()

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, [inputRef]);

  const handleSelect = (type, id) => {
    if (type === 'debt') {
      setLocation(`/admin/debts/${id}`);
      onClose();
    } else if (type === 'payer') {
      setLocation(`/admin/payers/${id}`);
      onClose();
    } else if (type === 'payment') {
      setLocation(`/admin/payments/${id}`);
      onClose();
    } else if (type === 'debt_center') {
      setLocation(`/admin/debt-centers/${id}`);
      onClose();
    }
  }

  return (
    <DialogBase onClose={() => onClose()}>
      <DialogHeader>Search</DialogHeader>
      <DialogContent>
        <div className="flex gap-3 items-center">
          <Dropdown
            options={[
              { value: 'debt', text: 'Debt' },
              { value: 'debt_center', text: 'Debt Center' },
              { value: 'payment', text: 'Payment' },
              { value: 'payer', text: 'Payer' },
              { value: 'transaction', text: 'Transaction' },
            ]}
            name='type'
            value={type}
            createCustomOption={() => ({})}
            formatCustomOption={() => 'Asd'}
            label='Type'
            onSelect={(value) => setType(value)}
            onChange={() => { }}
          />
          <TextField
            placeholder="Search..."
            onChange={(evt) => setTerm(evt.target.value)}
            className="flex-grow"
            ref={inputRef}
          />
        </div>

        <div className="overflow-y-scroll max-h-80 px-5 mt-3 w-[40em] overflow-hidden">
          {(results ?? []).map(({ type, name, id }) => (
            <div
              className="rounded-md border border-gray-300 focus:border-blue-500 mt-2 p-2 shadow-sm cursor-pointer"
              tabIndex={0}
              onKeyDown={(evt) => evt.code === 'Enter' && handleSelect(type, id)}
              onClick={() => handleSelect(type, id)}
            >
              <h1 className="flex items-start">
                <span className="py-0.5 px-1.5 rounded-[2pt] bg-blue-500 text-xs font-bold text-white mr-3 capitalize">{type.replace(/_/g, ' ')}</span>
                <span>{name}</span>
              </h1>
            </div>
          ))}
        </div>
      </DialogContent>
      <DialogFooter>
        <Button onClick={() => onClose()}>Close</Button>
      </DialogFooter>
    </DialogBase>
  )
}
