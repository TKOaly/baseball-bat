import {
  DialogBase,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from '../../components/dialog';
import { Button } from '@bbat/ui/button';
import { TextField } from '@bbat/ui/text-field';
import { useSearchQuery } from '../../api/search';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { Dropdown } from '@bbat/ui/dropdown';
import { useFetchResourceDetails } from '../../hooks/use-fetch-resource-details';
import { ResourceLink } from '../resource-link';

export type Props = {
  onClose: (_: { id: string; type: string } | null) => void;
  type?: string;
  openOnSelect?: boolean;
  title?: string;
  prompt?: string;
};

export type SearchResultItemProps = {
  type: string;
  id: string;
  name: string;
  onSelect: () => void;
};

const SearchResultItem = ({
  type,
  id,
  name,
  onSelect,
}: SearchResultItemProps) => {
  const details = useFetchResourceDetails(type, id);

  return (
    <div
      className="mt-2 cursor-pointer rounded-md border border-gray-300 p-2 shadow-sm focus:border-blue-500"
      tabIndex={0}
      onKeyDown={evt => evt.code === 'Enter' && onSelect()}
      onClick={() => onSelect()}
    >
      <h1 className="flex items-start">
        <span className="mr-3 rounded-[2pt] bg-blue-500 px-1.5 py-0.5 text-xs font-bold capitalize text-white">
          {type.replace(/_/g, ' ')}
        </span>
        <span>{details?.name ?? name}</span>
      </h1>
      <table className="text-sm">
        {(details?.details ?? []).map(([label, details]) => {
          let value = null;

          if (details.type === 'text') {
            value = details.value;
          } else if (details.type === 'resource') {
            value = (
              <ResourceLink type={details.resourceType} id={details.id} />
            );
          }

          return (
            <tr key={label}>
              <th className="pr-2 text-left text-gray-700">{label}</th>
              <td>{value}</td>
            </tr>
          );
        })}
      </table>
    </div>
  );
};

export const GlobalSearchDialog = ({
  onClose,
  type: pType,
  title,
  prompt,
  openOnSelect = false,
}: Props) => {
  const [term, setTerm] = useState('');
  const [type, setType] = useState(pType);
  const isTypeLocked = pType !== undefined;
  const { data: fullResults } = useSearchQuery(
    { term, type },
    { skip: term === '' },
  );
  const [, setLocation] = useLocation();
  const inputRef = useRef<HTMLInputElement>(null);
  const results = useMemo(
    () => (fullResults ? [...fullResults].splice(0, 10) : null),
    [fullResults],
  );

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
        <div className="flex items-center gap-3">
          {!isTypeLocked && (
            <Dropdown
              options={[
                { value: 'debt', text: 'Debt' },
                { value: 'debt_center', text: 'Debt Center' },
                { value: 'payment', text: 'Payment' },
                { value: 'payer', text: 'Payer' },
                { value: 'transaction', text: 'Transaction' },
              ]}
              name="type"
              value={type}
              label="Type"
              onSelect={value => setType(value)}
            />
          )}
          <TextField
            placeholder="Search..."
            onChange={evt => setTerm(evt.target.value)}
            className="flex-grow"
            ref={inputRef}
          />
        </div>

        <div className="-mx-3 -mb-3 mt-3 max-h-80 overflow-hidden overflow-y-scroll border-t px-5">
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
        <Button onClick={() => onClose(null)}>Close</Button>
      </DialogFooter>
    </DialogBase>
  );
};
