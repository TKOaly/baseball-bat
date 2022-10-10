import React, { useContext, useEffect, useState, createContext } from 'react'
import { X } from 'react-feather'
import { createPortal } from 'react-dom'

export type DialogContextValue = {
  dialogs: {
    key: string,
    content: React.ReactNode,
    resolve: (value: unknown) => void,
  }[],
  closeDialog: (key: string, value: unknown) => void,
  openDialog: <P extends React.FunctionComponent, V>(component: DialogComponent<any>, props: Omit<React.ComponentProps<P>, 'onClose'>) => Promise<V>,
}

export const DialogContext = createContext<DialogContextValue>({
  dialogs: [],
  closeDialog: () => { },
  openDialog: () => Promise.reject(),
})

export const useDialog = <P extends DialogProps<V>, V>(component: DialogComponent<P>) => {
  const { openDialog } = useContext(DialogContext)
  return (props: Omit<P, 'onClose'>) => openDialog(component, props)
}

export const DialogContextProvider = ({ children }) => {
  const [dialogs, setDialogs] = useState<DialogContextValue['dialogs']>([])

  const closeDialog = (key: string) => {
    setDialogs((prev) => {
      const index = prev.findIndex(d => d.key === key);

      if (index === -1) {
        return prev;
      }

      const newDialogs = [...prev]

      newDialogs.splice(index, 1)

      return newDialogs
    })
  }

  const openDialog = <C extends React.FC>(Component: C, props: React.ComponentProps<C>) => new Promise<React.ComponentProps<C> extends DialogProps<infer V> ? V : unknown>((resolve) => {
    let key: string

    do {
      key = Math.floor((1 + Math.random()) * 0x10000)
        .toString(16)
        .substring(1);
    } while (dialogs.findIndex(d => d.key === key) > -1);

    setDialogs((prev) => [...prev, {
      content: <Component {...props} onClose={(value) => { resolve(value); closeDialog(key); }} />,
      key,
      resolve,
    }])
  })

  const value: DialogContextValue = {
    dialogs,
    openDialog,
    closeDialog,
  }

  return (
    <DialogContext.Provider value={value}>
      {children}
    </DialogContext.Provider>
  )
}

export type DialogProps<V> = {
  onClose: (value: V) => void,
}

export type DialogComponent<P extends DialogProps<unknown>> = React.FC<P>;

export const DialogTarget = () => {
  const { dialogs } = useContext(DialogContext)

  return dialogs.map(({ content }) => content)
}

export const Portal = ({ children, containerId }) => {
  let element = document.getElementById(containerId)

  if (!element) {
    element = document.createElement('div')

    element.id = containerId

    Object.assign(element.style, {
      inset: '0px',
      position: 'absolute',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.2)'
    })

    document.body.appendChild(element)
  }

  useEffect(() => {
    return () => {
      document.body.removeChild(element);
    };
  }, [])

  return createPortal(children, element)
}

export const DialogBase = ({ children, onClose }) => {
  return (
    <div className="absolute inset-0 bg-black bg-opacity-30 flex items-center justify-center z-10" onClick={onClose}>
      <div className="rounded-lg flex flex-col bg-white border shadow-lg min-w-[35em] min-h-[15em]" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

export const DialogContent = ({ children }) => {
  return (
    <div className="flex-grow p-3">
      {children}
    </div>
  )
}

export const DialogHeader = ({ children }) => {
  return (
    <div className="flex gap-5 items-center p-3 border-b">
      <span className="font-bold flex-grow">{children}</span>
    </div>
  )
}

export const DialogFooter = ({ children }) => {
  return (
    <div className="flex justify-end border-t p-3 text-sm gap-2">
      {children}
    </div>
  )
}

export const Dialog = ({ title = '', children, closeButton = null, open, noClose }) => {
  let close = <X className="text-gray-400 rounded-full hover:bg-gray-100 p-0.5 h-6 w-6" />

  if (closeButton) {
    close = <span>{closeButton}</span>
  }

  if (noClose) close = null

  if (!open)
    return <div />

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
  )
}
