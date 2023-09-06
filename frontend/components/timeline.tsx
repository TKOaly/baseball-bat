import { Circle } from 'react-feather';
import { formatRelative } from 'date-fns';

export type TimelineEvent = {
  time: Date;
  title: string;
  body?: string;
};

export type TimelineProps = {
  events: Array<TimelineEvent>;
};

export const Timeline = ({ events }: TimelineProps) => {
  return (
    <ul className="px-3">
      {events.map((event, i) => (
        <li className="flex items-start" key={String(event.time)}>
          <div className="flex flex-col self-stretch items-center mr-3">
            <div className={`h-8 ${i > 0 ? 'w-0.5 bg-gray-300' : ''}`}></div>
            <Circle
              className="text-xs text-blue-500 group-hover:text-blue-500"
              style={{ width: '1em', strokeWidth: '4px' }}
            />
            {i < events.length - 1 && (
              <div className="w-0.5 flex-grow bg-gray-300"></div>
            )}
          </div>
          <div>
            <span className="text-xs capitalize text-gray-600 pl-2">
              {formatRelative(event.time, Date.now())}
            </span>
            <div className="rounded-md border border-gray-300 bg-gray-50 py-2 px-3 shadow-sm text-sm mb-3">
              <h4 className="font-bold text-gray-700">{event.title}</h4>
              <p>{event.body}</p>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
};
