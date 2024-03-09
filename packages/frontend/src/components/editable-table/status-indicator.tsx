import { useState } from 'react';
import { AnnotationType, Annotations } from './state';
import {
  useFloating,
  offset,
  shift,
  flip,
  autoUpdate,
  useHover,
  useInteractions,
  FloatingPortal,
} from '@floating-ui/react';
import { AlertTriangle, Info, Loader } from 'react-feather';

type StatusIndicatorProps = {
  annotations: Annotations;
};

const STATUS_PRECEDENCE: Array<AnnotationType> = [
  'loading',
  'error',
  'warning',
  'info',
];

export const StatusIndicator = (props: StatusIndicatorProps) => {
  const [open, setOpen] = useState(false);

  const { x, y, refs, strategy, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: 'bottom-start',
    middleware: [
      offset({
        mainAxis: 8,
        crossAxis: -7,
      }),
      shift(),
      flip(),
    ],
    whileElementsMounted: autoUpdate,
  });

  const { getReferenceProps, getFloatingProps } = useInteractions([
    useHover(context, {
      move: false,
    }),
  ]);

  if (props.annotations.size === 0) {
    return null;
  }

  const [{ type }] = [...props.annotations.values()].sort(
    (a, b) =>
      STATUS_PRECEDENCE.indexOf(a.type) - STATUS_PRECEDENCE.indexOf(b.type),
  );

  const getIcon = (type: AnnotationType) =>
    (
      ({
        loading: (props: any) => (
          <Loader
            className={
              'animate-[spin_3s_linear_infinite] text-blue-500 duration-200'
            }
            {...props}
          />
        ),
        error: (props: any) => (
          <AlertTriangle className="text-red-500" {...props} />
        ),
        info: (props: any) => <Info className="text-blue-500" {...props} />,
        warning: (props: any) => <Info className="text-blue-500" {...props} />,
      }) satisfies Record<AnnotationType, any>
    )[type];

  const Icon = getIcon(type) ?? getIcon('error');

  return (
    <div>
      <div
        ref={refs.setReference}
        {...getReferenceProps({ style: { width: '1.2em', height: '1.2em' } })}
      >
        <Icon style={{ width: '100%', height: '100%' }} />
      </div>
      <FloatingPortal>
        {open && (
          <div
            ref={refs.setFloating}
            {...getFloatingProps()}
            style={{
              position: strategy,
              top: y ?? 0,
              left: x ?? 0,
              width: 'max-content',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.2em',
              maxWidth: '20em',
            }}
          >
            {[...props.annotations.entries()].map(([id, { type, message }]) => {
              const Icon = getIcon(type) ?? getIcon('error');

              return (
                <div
                  key={id}
                  className={`flex items-center gap-2 px-2 py-1 text-sm ${
                    {
                      error: 'bg-red-500',
                      warning: 'bg-red-500',
                      info: 'bg-blue-500',
                      loading: 'bg-blue-500',
                    }[type]
                  } rounded text-white shadow-md`}
                >
                  <Icon
                    className="text-white"
                    style={{ width: '1.2em', hieght: '1.2em', flexShrink: '0' }}
                  />
                  {message ?? ''}
                </div>
              );
            })}
          </div>
        )}
      </FloatingPortal>
    </div>
  );
};
