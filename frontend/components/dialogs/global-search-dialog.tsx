import { DialogBase, DialogContent, DialogFooter, DialogHeader } from '../../components/dialog';
import { Button } from '../../components/button';
import { TextField } from '../text-field';
import { useSearchQuery } from '../../api/search';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { Dropdown } from '../dropdown';
import { useFetchResourceDetails } from '../../hooks/use-fetch-resource-details';
import { ResourceLink } from '../resource-link';

export type Props = {
  onClose: (_: { id: string, type: string } | null) => void,
  type?: string,
  openOnSelect?: boolean
  title?: string
  prompt?: string
}

const SearchResultItem = ({ type, id, name, onSelect }) => {
  const details = useFetchResourceDetails(type, id);

  return (
    <div
      className="rounded-md border border-gray-300 focus:border-blue-500 mt-2 p-2 shadow-sm cursor-pointer"
      tabIndex={0}
      onKeyDown={(evt) => evt.code === 'Enter' && onSelect()}
      onClick={() => onSelect()}
    >
      <h1 className="flex items-start">
        <span className="py-0.5 px-1.5 rounded-[2pt] bg-blue-500 text-xs font-bold text-white mr-3 capitalize">{type.replace(/_/g, ' ')}</span>
        <span>{details?.name ?? name}</span>
      </h1>
      <table className="text-sm">
        {
          (details?.details ?? []).map(([label, details]) => {
            let value = null;

            if (details.type === 'text') {
              value = details.value;
            } else if (details.type === 'resource') {
              value = <ResourceLink type={details.resourceType} id={details.id} />;
            }

            return (
              <tr key={label}>
                <th className="text-left text-gray-700 pr-2">{label}</th>
                <td>{value}</td>
              </tr>
            );
          })
        }
      </table>
    </div>
  );
};

export const GlobalSearchDialog = ({ onClose, type: pType, title, prompt, openOnSelect = false }: Props) => {
  const [term, setTerm] = useState('');
  const [type, setType] = useState(pType);
  const isTypeLocked = pType !== undefined;
  const { data: fullResults } = useSearchQuery({ term, type }, { skip: term === '' });
  const [, setLocation] = useLocation();
  const inputRef = useRef<HTMLInputElement>();
  const results = useMemo(() => fullResults ? [...fullResults].splice(0, 10) : null, [fullResults]);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, [inputRef]);

  const handleSelect = (type: string, id: string) => {
    if (openOnSelect) {
      if (type === 'debt') {
        setLocation(`/admin/debts/${id}`);
      } else if (type === 'payer') {
        setLocation(`/admin/payers/${id}`);
      } else if (type === 'payment') {
        setLocation(`/admin/payments/${id}`);
      } else if (type === 'debt_center') {
        setLocation(`/admin/debt-centers/${id}`);
      }
    }

    onClose({
      type,
      id,
    });
  };

  return (
    <DialogBase onClose={() => onClose(null)}>
      <DialogHeader>{title ?? 'Search'}</DialogHeader>
      <DialogContent>
        <p>{prompt}</p>
        <div className="flex gap-3 items-center">
          {!isTypeLocked && (
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
            />
          )}
          <TextField
            placeholder="Search..."
            onChange={(evt) => setTerm(evt.target.value)}
            className="flex-grow"
            ref={inputRef}
          />
        </div>

        <div className="overflow-y-scroll max-h-80 px-5 mt-3 -mb-3 -mx-3 border-t overflow-hidden">
          {(results ?? []).map(({ type, name, id }) => (
            <SearchResultItem
              key={id}
              type={type}
              id={id}
              name={name}
              onSelect={() => handleSelect(type, id)}
            />
          ))}
        </div>
      </DialogContent>
      <DialogFooter>
        <Button onClick={() => onClose()}>Close</Button>
      </DialogFooter>
    </DialogBase>
  );
};
