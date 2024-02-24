import React, {
  useContext,
  useEffect,
  useState,
  createContext,
  PropsWithChildren,
  ReactNode,
  JSXElementConstructor,
  ComponentProps,
} from 'react';
import { X } from 'react-feather';
import { createPortal } from 'react-dom';
import { cva } from 'class-variance-authority';
import { uid } from 'uid';

type DialogResultType<C extends JSXElementConstructor<any>> =
  React.ComponentProps<C> extends DialogProps<infer V> ? V : unknown;

export type DialogContextValue = {
  dialogs: {
    key: string;
    content: React.ReactNode;
    resolve: (value: unknown) => void;
  }[];
  closeDialog: (key: string, value: unknown) => void;
  openDialog: <C extends React.JSXElementConstructor<DialogProps<any>>>(
    Component: C,
    props: Omit<ComponentProps<C>, 'onClose'>,
  ) => Promise<DialogResultType<C>>;
};

export const DialogContext = createContext<DialogContextValue>({
  dialogs: [],
  closeDialog: () => {}, // eslint-disable-line @typescript-eslint/no-empty-function
  openDialog: () => Promise.reject(),
});

export const useDialog = <C extends DialogComponent<any>>(component: C) => {
  const { openDialog } = useContext(DialogContext);
  return (
    props: Omit<ComponentProps<C>, 'onClose'>,
  ): Promise<DialogResultType<C>> => openDialog(component, props);
};

export const DialogContextProvider = ({
  children,
}: {
  children?: ReactNode;
}) => {
  const [dialogs, setDialogs] = useState<DialogContextValue['dialogs']>([]);

  const closeDialog = (key: string) => {
    setDialogs(prev => {
      const index = prev.findIndex(d => d.key === key);

      if (index === -1) {
        return prev;
      }

      const newDialogs = [...prev];

      newDialogs.splice(index, 1);

      return newDialogs;
    });
  };

  const openDialog = <C extends React.JSXElementConstructor<DialogProps<any>>>(
    Component: C,
    props: Omit<ComponentProps<C>, 'onClose'>,
  ) =>
    new Promise<DialogResultType<C>>(resolve => {
      const key = uid();

      setDialogs(prev => [
        ...prev,
        {
          content: (
            <Component
              {...(props as any)}
              onClose={value => {
                closeDialog(key);
                resolve(value);
              }}
            />
          ),
          key,
          resolve: v => {
            resolve(
              v as React.ComponentProps<C> extends DialogProps<infer V>
                ? V
                : unknown,
            );
          },
        },
      ]);
    });

  const value: DialogContextValue = {
    dialogs,
    openDialog,
    closeDialog,
  };

  return (
    <DialogContext.Provider value={value}>{children}</DialogContext.Provider>
  );
};

export type DialogProps<V> = {
  onClose: (value: V) => void;
};

export type DialogComponent<P extends DialogProps<any>> = React.FC<P>;

export const DialogTarget = () => {
  const { dialogs } = useContext(DialogContext);

  return dialogs.map(({ content }) => content);
};

export const Portal = ({
  children,
  containerId,
}: PropsWithChildren<{ containerId: string }>) => {
  let element = document.getElementById(containerId);

  if (!element) {
    element = document.createElement('div');

    element.id = containerId;

    Object.assign(element.style, {
      inset: '0px',
      position: 'absolute',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.2)',
    });

    document.body.appendChild(element);
  }

  useEffect(() => {
    return () => {
      if (element) {
        document.body.removeChild(element);
      }
    };
  }, []);

  return createPortal(children, element);
};

const dialogCva = cva('rounded-lg flex flex-col bg-white border shadow-lg', {
  variants: {
    size: {
      normal: 'w-[30em]',
      wide: '',
    },
  },
});

export const DialogBase = <T,>({
  children,
  onClose,
  wide = false,
  className = '',
  ...rest
}: PropsWithChildren<
  React.HTMLAttributes<HTMLDivElement> & {
    wide?: boolean;
    onClose: (t: T | null) => void;
  }
>) => {
  return (
    <div
      {...rest}
      className="absolute inset-0 bg-black bg-opacity-30 flex items-center justify-center z-10 dialog-base"
      onClick={() => onClose(null)}
    >
      <div
        className={dialogCva({ size: wide ? 'wide' : 'normal', className })}
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
};

export const DialogContent = ({ children }: { children: ReactNode }) => {
  return (
    <div className="flex-grow max-h-[80vh] overflow-y-auto">
      <div className="p-3">{children}</div>
    </div>
  );
};

export const DialogHeader = ({ children }: { children: ReactNode }) => {
  return <div className="flex gap-3 items-center p-3 border-b">{children}</div>;
};

export const DialogFooter = ({ children }: { children: ReactNode }) => {
  return (
    <div className="flex justify-end border-t p-3 text-sm gap-2">
      {children}
    </div>
  );
};

export const Dialog = ({
  title = '',
  children,
  closeButton = null,
  open,
  noClose,
}: PropsWithChildren<{
  title: string;
  closeButton?: ReactNode;
  open: boolean;
  noClose?: boolean;
}>) => {
  let close: ReactNode | null = (
    <X className="text-gray-400 rounded-full hover:bg-gray-100 p-0.5 h-6 w-6" />
  );

  if (closeButton) {
    close = <span>{closeButton}</span>;
  }

  if (noClose) close = null;

  if (!open) return <div />;

  return (
    <Portal containerId="dialog-container">
      <div className="rounded-lg bg-white border shadow-lg p-3 min-w-[35em] min-h-[15em]">
        <div className="flex gap-5 items-center mb-3">
          <span className="font-bold flex-grow">{title}</span>
          {close}
        </div>
        <div>{children}</div>
      </div>
    </Portal>
  );
};
