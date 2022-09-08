import React, { useEffect } from 'react'
import { X } from 'react-feather'
import { createPortal } from 'react-dom'

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
