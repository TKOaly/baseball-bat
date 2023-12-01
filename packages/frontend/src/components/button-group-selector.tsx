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
    <div className="rounded-md border overflow-hidden inline-flex shadow-sm bg-white">
      {options.map(option => {
        const active =
          value === option.value
            ? 'bg-white font-bold cursor-default'
            : 'hover:bg-gray-100 cursor-pointer';

        return (
          <button
            className={`px-4 py-2 text-gray-700 ${
              disabled ? 'text-gray-300' : undefined
            } ${active} outline-offset-[-2px] text-sm border-r select-none`}
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
