import React, { useCallback, useEffect, useRef, useState } from 'react';
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
} from '@floating-ui/react-dom-interactions';

export const DateField = ({
  value,
  allowEmpty = true,
  onChange,
  format: formatString = 'dd.MM.yyyy',
  ...props
}) => {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const ref = useRef();

  const [displayValue, setDisplayValue] = useState('');

  const resetDisplayValue = useCallback(() => {
    console.log('RESET');

    try {
      const date = parse(value, formatString, new Date());
      setDisplayValue(format(date, 'dd.MM.yyyy'));
    } catch (e) {
      setDisplayValue('');
    }
  }, [value, formatString, setDisplayValue]);

  useEffect(() => {
    resetDisplayValue();
  }, [value, resetDisplayValue]);

  const { x, y, reference, floating, strategy, context } = useFloating({
    placement: 'bottom',
    open: calendarOpen,
    onOpenChange: setCalendarOpen,
  });

  const { getReferenceProps, getFloatingProps } = useInteractions([
    useClick(context),
    useDismiss(context),
  ]);

  return (
    <div className="flex flex-col items-center relative" ref={ref}>
      <div ref={reference} className="relative w-full" {...getReferenceProps()}>
        <input
          type="text"
          className={`
            w-full
            bg-white
            w-full
            rounded-md
            ${props.error ? 'border-red-400' : 'border-gray-200'}
            mt-1
            shadow-sm
            py-2
            px-3
            border
          `}
          value={displayValue}
          onChange={evt => {
            setDisplayValue(evt.target.value);

            if (
              isMatch(evt.target.value, 'dd.MM.yyyy') ||
              (evt.target.value === '' && allowEmpty)
            ) {
              onChange({
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
        <div className="absolute right-0 top-0 flex items-center mr-2 pt-1 bottom-0">
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
            ref={floating}
            style={{
              position: strategy,
              top: y ?? 0,
              left: x ?? 0,
            }}
            className="bg-white rounded-b-md absolute top-full z-10 border shadow-xl border-gray-200 mt-[-1px]"
            {...getFloatingProps()}
          >
            <DayPicker
              mode="single"
              modifiersClassNames={{ selected: 'bg-blue-500' }}
              onSelect={day => {
                onChange({
                  target: {
                    id: props.id,
                    name: props.name,
                    value: format(day, formatString),
                  },
                });
              }}
            />
          </div>
        )}
      </FloatingPortal>
    </div>
  );
};