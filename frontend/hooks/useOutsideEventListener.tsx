import { RefObject, useCallback, useEffect } from 'react';

export const useOutsideEventListener = <T extends keyof DocumentEventMap, E extends HTMLElement>(
  ref: RefObject<E>,
  eventName: T,
  enable: boolean,
  eventHandler: (evt: DocumentEventMap[T]) => void,
) => {
  const handler = useCallback((evt: DocumentEventMap[T]) => {
    if (ref.current && evt.target instanceof Node && !ref.current.contains(evt.target)) {
      eventHandler(evt);
    }
  }, [eventHandler, ref]);

  useEffect(() => {
    if (enable) {
      document.addEventListener(eventName, handler, true);
      return () => document.removeEventListener(eventName, handler, true);
    }
  }, [enable, handler]);
};
