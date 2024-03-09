import {
  InputHTMLAttributes,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { DayPicker } from 'react-day-picker';
import { Calendar } from 'react-feather';
import { parse, format, isMatch } from 'date-fns';

import 'react-day-picker/dist/style.css';
import {
  FloatingPortal,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
} from '@floating-ui/react';

type DateFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  allowEmpty?: boolean;
  format?: string;
  error?: string;
};

export const DateField = ({
  value,
  allowEmpty = true,
  onChange,
  format: formatString = 'dd.MM.yyyy',
  ...props
}: DateFieldProps) => {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const [displayValue, setDisplayValue] = useState('');

  const resetDisplayValue = useCallback(() => {
    try {
      const date = parse(`${value}`, formatString, new Date());
      setDisplayValue(format(date, 'dd.MM.yyyy'));
    } catch (e) {
      setDisplayValue('');
    }
  }, [value, formatString, setDisplayValue]);

  useEffect(() => {
    resetDisplayValue();
  }, [value, resetDisplayValue]);

  const { x, y, refs, strategy, context } = useFloating({
    placement: 'bottom',
    open: calendarOpen,
    onOpenChange: setCalendarOpen,
  });

  const { getReferenceProps, getFloatingProps } = useInteractions([
    useClick(context),
    useDismiss(context),
  ]);

  return (
    <div className="relative flex flex-col items-center" ref={ref}>
      <div
        ref={refs.setReference}
        className="relative w-full"
        {...getReferenceProps()}
      >
        <input
          type="text"
          className={`
            w-full
            w-full
            rounded-md
            bg-white
            ${props.error ? 'border-red-400' : 'border-gray-200'}
            mt-1
            border
            px-3
            py-2
            shadow-sm
          `}
          value={displayValue}
          onChange={evt => {
            setDisplayValue(evt.target.value);

            if (
              isMatch(evt.target.value, 'dd.MM.yyyy') ||
              (evt.target.value === '' && allowEmpty)
            ) {
              onChange?.({
                ...evt,
                target: {
                  ...evt.target,
                  name: evt.target.name,
                  id: evt.target.id,
                  value: format(
                    parse(evt.target.value, 'dd.MM.yyyy', new Date()),
                    formatString,
                  ),
                },
              });
            }
          }}
          {...props}
          onBlur={evt => {
            resetDisplayValue();
            props?.onBlur?.(evt);
          }}
        />
        <div className="absolute bottom-0 right-0 top-0 mr-2 flex items-center pt-1">
          <Calendar
            className={`cursor-pointer ${
              calendarOpen
                ? 'text-blue-500 hover:text-blue-400'
                : 'text-gray-400 hover:text-gray-500'
            }`}
            onClick={() => setCalendarOpen(!calendarOpen)}
          />
        </div>
      </div>
      <FloatingPortal>
        {calendarOpen && (
          <div
            ref={refs.setFloating}
            style={{
              position: strategy,
              top: y ?? 0,
              left: x ?? 0,
            }}
            className="absolute top-full z-10 mt-[-1px] rounded-b-md border border-gray-200 bg-white shadow-xl"
            {...getFloatingProps()}
          >
            <DayPicker
              mode="single"
              modifiersClassNames={{ selected: 'bg-blue-500' }}
              onSelect={day => {
                if (day || allowEmpty) {
                  onChange?.({
                    target: {
                      id: props.id ?? '',
                      name: props.name ?? '',
                      value: day ? format(day, formatString) : '',
                    },
                  } as any);
                }
              }}
            />
          </div>
        )}
      </FloatingPortal>
    </div>
  );
};
