export interface Props<V> {
  options: {
    text: string;
    value: V;
  }[];
  onChange: (value: V) => void;
  value: V;
}

export function ButtonGroupSelector<V>({ options, onChange, value }: Props<V>) {
  return (
    <div className="rounded-md border overflow-hidden inline-flex shadow-sm bg-white">
      {options.map((option, i) => {
        let rounding = '';

        if (i === 0) {
          rounding = 'rounding-l-md';
        } else if (i === options.length - 1) {
          rounding = 'rounding-r-md';
        }

        const active = value === option.value ? 'bg-white font-bold' : '';

        return (
          <button
            className={`px-4 py-2 text-gray-700 ${rounding} ${active} text-sm border-r focus:ring-4 cursor-pointer hover:bg-gray-100`}
            onClick={() => onChange(option.value)}
            tabIndex={0}
            key={option.value}
          >
            {option.text}
          </button>
        );
      })}
    </div>
  );
}
