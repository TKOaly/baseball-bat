import React, { useRef, useState } from 'react';
import { DayPicker } from 'react-day-picker';
import { Calendar } from 'react-feather';
import { format } from 'date-fns';
import { useOutsideEventListener } from '../hooks/useOutsideEventListener';

import 'react-day-picker/dist/style.css';

export const DateField = ({ value, onChange, ...props }) => {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const ref = useRef();
  useOutsideEventListener(ref, 'click', calendarOpen, () => setCalendarOpen(false));

  return (
    <div className="flex flex-col items-center relative" ref={ref}>
      <div className="relative w-full">
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
          value={value}
          onChange={onChange}
          {...props}
        />
        <div className="absolute right-0 top-0 flex items-center mr-2 pt-1 bottom-0">
          <Calendar className={`cursor-pointer ${calendarOpen ? 'text-blue-500 hover:text-blue-400' : 'text-gray-400 hover:text-gray-500'}`} onClick={() => setCalendarOpen(!calendarOpen)} />
        </div>
      </div>
      {calendarOpen && (
        <div className="bg-white rounded-b-md absolute top-full z-10 border shadow-xl border-gray-200 mt-[-1px]">
          <DayPicker
            mode="single"
            modifiersClassNames={{ selected: 'bg-blue-500' }}
            onSelect={(day) => {
              onChange({ target: { id: props.id, name: props.name, value: format(day, 'dd.MM.yyyy') } });
              console.log(format(day, 'dd.mm.yyyy'));
            }}
          />
        </div>
      )}
    </div>
  );
};
