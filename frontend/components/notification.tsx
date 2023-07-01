import { useEffect } from "react";
import notificationsSlice, { NotificationButton, NotificationType, selectNotification } from "../state/notifications";
import { useAppDispatch, useAppSelector } from "../store";
import { Info, AlertTriangle, CheckCircle, X } from "react-feather";
import { cva } from "class-variance-authority";

export type Props = {
  id: string,
};

const HourGlass = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5" viewBox="0 0 384 512" fill="currentColor"><path d="M24 0C10.7 0 0 10.7 0 24S10.7 48 24 48h8V67c0 40.3 16 79 44.5 107.5L158.1 256 76.5 337.5C48 366 32 404.7 32 445v19H24c-13.3 0-24 10.7-24 24s10.7 24 24 24H360c13.3 0 24-10.7 24-24s-10.7-24-24-24h-8V445c0-40.3-16-79-44.5-107.5L225.9 256l81.5-81.5C336 146 352 107.3 352 67V48h8c13.3 0 24-10.7 24-24s-10.7-24-24-24H24zM192 289.9l81.5 81.5C293 391 304 417.4 304 445v19H80V445c0-27.6 11-54 30.5-73.5L192 289.9zm0-67.9l-81.5-81.5C91 121 80 94.6 80 67V48H304V67c0 27.6-11 54-30.5 73.5L192 222.1z"/></svg>
);

const NotificationIcon = (props: { type: NotificationType }) => {
  const icons: Record<NotificationType, any> = {
    info: Info,
    error: AlertTriangle,
    success: CheckCircle,
    task: HourGlass,
  };

  const IconComponent = icons[props.type];

  return (
    <IconComponent />
  );
};

const NotificationProgress = (props) => (
  <div className="flex gap-1.5 pl-3 items-center mr-3 col-[2_/_span_2]">
    <div className="text-sm mr-0.5 relative t-[-1px]">{Math.round(props.value / (props.max ?? 1) * 100)}%</div>
    <div className="h-1 rounded-full bg-white/25 overflow-hidden flex-grow">
      <div className="h-full bg-white/50" style={{ width: `${Math.round(props.value / (props.max ?? 1) * 100)}%` }}></div>
    </div>
  </div>
);

const NotificationButton = (props: NotificationButton) => (
  <button className="px-1.5 mt-1 text-sm py-0.5 bg-white/10 rounded-sm inline-block">{props.label}</button>
);

const baseClasses = cva('rounded-md shadow-md bg-gradient-to-br overflow-hidden [text-shadow:_0px_1px_1px_rgba(0,0,0,0.2)] pointer-events-auto grid grid-cols-3', {
  variants: {
    type: {
      info: ['text-white', 'from-blue-500', 'to-blue-600'],
      error: ['text-white', 'from-red-500', 'to-red-600'],
      success: ['text-white', 'from-green-400', 'to-green-500'],
      task: ['text-gray-600', 'from-gray-100', 'to-gray-200'],
    } as Record<NotificationType, string[]>,
  },
  defaultVariants: {
    type: 'info',
  },
});

const timerClasses = cva('h-1', {
  variants: {
    type: {
      info: ['bg-blue-400'],
      error: ['bg-red-400'],
      success: ['bg-green-400'],
      task: ['bg-gray-300'],
    },
  },
});

export const Notification = (props: Props) => {
  const dispatch = useAppDispatch();
  const notification = useAppSelector((state) => selectNotification(state, props.id));

  const dismissDuration = 10000;

  useEffect(() => {
    const timeout = setTimeout(() => {
      dispatch(notificationsSlice.actions.dismissNotification({
        id: props.id,
      }));
    }, dismissDuration);

    return () => clearTimeout(timeout);
  }, [dispatch]);

  const handleDismiss = () => {
    dispatch(notificationsSlice.actions.dismissNotification({
      id: props.id,
    }));
  };

  return (
    <div className={baseClasses({ type: notification.type })} style={{ gridTemplateColumns: 'min-content auto min-content' }}>
      <div className="w-10 flex items-start pt-4 justify-center row-span-2 pl-3">
        <div>
          <NotificationIcon type={notification.type} />
        </div>
      </div>
      <div className="flex-grow py-2 px-3">
        <h1 className="font-bold">{notification.title}</h1>
        <p>{notification.body}</p>
      </div>
      <div>
        <button className="rounded-sm hover:bg-black/10 inline-block mt-2 mr-2 h-6 w-6 flex items-center justify-center cursor-pointer" onClick={handleDismiss}>
          <X className="h-5" />
        </button>
      </div>
      { notification.progress !== undefined && <NotificationProgress value={notification.progress} max={notification.progressMax} /> }
      <div className="flex justify-end col-span-3 mr-3 mb-2 gap-2">
        {notification.buttons.map((button) => <NotificationButton key={button.id} {...button} />)}
      </div>
      <div className="col-span-full">
        <div style={{ animation: `${dismissDuration}ms linear 1 progress` }} className={timerClasses({ type: notification.type })}></div>
      </div>
    </div>
  );
}
