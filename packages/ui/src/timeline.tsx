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
          <div className="mr-3 flex flex-col items-center self-stretch">
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
            <span className="pl-2 text-xs capitalize text-gray-600">
              {formatRelative(event.time, Date.now())}
            </span>
            <div className="mb-3 rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm shadow-sm">
              <h4 className="font-bold text-gray-700">{event.title}</h4>
              <p>{event.body}</p>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
};
