export interface Props<V> {
  options: {
    text: string;
    value: V;
  }[];
  onChange: (value: V) => void;
  value: V;
  disabled?: boolean;
}

export function ButtonGroupSelector<V>({
  options,
  onChange,
  value,
  disabled = false,
}: Props<V>) {
  return (
    <div className="inline-flex overflow-hidden rounded-md border bg-white shadow-sm">
      {options.map(option => {
        const active =
          value === option.value
            ? 'bg-white font-bold cursor-default'
            : 'hover:bg-gray-100 cursor-pointer';

        return (
          <button
            className={`px-4 py-2 text-gray-700 ${
              disabled ? 'text-gray-300' : undefined
            } ${active} select-none border-r text-sm outline-offset-[-2px]`}
            onClick={() => onChange(option.value)}
            tabIndex={0}
            key={option.text}
            disabled={disabled || value === option.value}
          >
            {option.text}
          </button>
        );
      })}
    </div>
  );
}
