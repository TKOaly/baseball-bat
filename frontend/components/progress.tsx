export type Props = {
  value: number
  max: number
  message?: string
  noText?: boolean
}

export const Progress: React.FC<Props> = ({
  value,
  max,
  message,
  noText = false,
}) => {
  let text = `(${value} / ${max})`;

  if (message) {
    text += ` ${message}`;
  }

  if (noText) {
    text = null;
  }

  const percentage = (!value || !max) ? 0 : (value / max);

  return (
    <div className="relative text-sm h-7">
      <div className="rounded-md px-2 absolute inset-0 overflow-hidden bg-gray-200 shadow-sm border border-gray-300 flex items-center">
        {text}
      </div>
      <div className="absolute inset-0 overflow-hidden rounded-md">
        <div
          className={`
            will-change-[width]
            rounded-l-md
            items-center
            whitespace-nowrap
            px-2
            h-full
            overflow-hidden
            bg-gray-200
            shadow-sm
            border-l
            border-t
            border-b
            border-blue-600
            w-full
            left-0
            top-0
            bottom-0
            px-1
            py-0.5
            overflow-hidden
            bg-blue-600
            text-white
          `}
          style={{
            width: `${(percentage * 100).toFixed()}%`,
            display: percentage === 0 ? 'none' : 'flex',
          }}
        >
          {text}
        </div>
      </div>
    </div>
  );
};
