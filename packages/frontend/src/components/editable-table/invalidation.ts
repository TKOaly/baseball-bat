import { useCallback, useEffect, useRef, useState } from 'react';

type State = {
  invalidated: { key: string; payload: any }[];
  invalidationTimeout: ReturnType<typeof setTimeout> | null;
  subscriptions: Map<
    string,
    Set<{ callback: (payload: any) => void; immediate: boolean }>
  >;
};

export const useInvalidation = () => {
  const ref = useRef<State>({
    invalidated: [],
    invalidationTimeout: null,
    subscriptions: new Map(),
  });

  const invalidate = useCallback(
    (tag: string, payload: any) => {
      ref.current.invalidated.push({ key: tag, payload });

      const callbacks = ref.current.subscriptions.get(tag);

      if (!callbacks) {
        return;
      }

      for (const { callback, immediate } of callbacks) {
        if (immediate) {
          callback(payload);
        }
      }

      if (!ref.current.invalidationTimeout) {
        ref.current.invalidationTimeout = setTimeout(() => {
          const invalidated = ref.current.invalidated;
          ref.current.invalidated = [];
          ref.current.invalidationTimeout = null;

          console.info(`Handling ${invalidated.length} invalidations...`);

          invalidated.forEach(({ key, payload }) => {
            const callbacks = ref.current.subscriptions.get(key);

            if (!callbacks) {
              return;
            }

            for (const { callback, immediate } of callbacks) {
              if (!immediate) {
                callback(payload);
              }
            }
          });
        }, 0);
      }
    },
    [ref],
  );

  const subscribe = useCallback(
    (tag: string, callback: (payload: any) => void, immediate = false) => {
      const callbacks = ref.current.subscriptions.get(tag);

      if (!callbacks) {
        ref.current.subscriptions.set(tag, new Set([{ callback, immediate }]));
      } else {
        callbacks.add({ callback, immediate });
      }
    },
    [ref],
  );

  const unsubscribe = useCallback(
    (callback: () => void) => {
      for (const subscriptions of ref.current.subscriptions.values()) {
        subscriptions.delete({ callback, immediate: true }); // FIXME
      }
    },
    [ref],
  );

  return { invalidate, subscribe, unsubscribe };
};

export interface Invalidation {
  subscribe: (
    tag: string,
    callback: (payload: any) => void,
    immediate?: boolean,
  ) => void;
  unsubscribe: (callback: () => void) => void;
}

export const createInvalidableHook = <A extends any[], T>(
  names: (...args: A) => string[],
  hook: (...args: A) => T,
): ((invalidation: Invalidation, ...args: A) => T) => {
  return ({ subscribe, unsubscribe }, ...args) => {
    const [[result], setResult] = useState([hook(...args)]);
    const listenerRef = useRef<() => void>();
    useEffect(() => {
      const listener = (listenerRef.current = () => {
        setResult([hook(...args)]);
      });

      names(...args).forEach(tag => subscribe(tag, listener));

      return () => listenerRef.current && unsubscribe(listenerRef.current);
    }, [listenerRef, setResult, subscribe, unsubscribe]);

    return result;
  };
};
