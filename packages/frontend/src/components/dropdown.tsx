import { useRef, useState } from 'react';
import { ChevronDown } from 'react-feather';
import {
  useInteractions,
  useFloating,
  useListNavigation,
  useDismiss,
  useClick,
  FloatingPortal,
  autoUpdate,
} from '@floating-ui/react-dom-interactions';
import { useOutsideEventListener } from '../hooks/useOutsideEventListener';

type DropdownProps = {
  label?: string | React.ReactNode;
  scroll?: boolean;
  renderTrigger?: (
    arg: any,
    arg2: { label: React.ReactNode | string | null; open: boolean },
  ) => React.ReactNode;
  showArrow?: boolean;
  value?: string;
  options: any[];
  onSelect?: (value: string) => void;
  className?: string;
  disabled?: boolean;
};

export function Dropdown<P extends DropdownProps>({
  label = null,
  scroll = false,
  renderTrigger,
  showArrow = true,
  options,
  onSelect,
  disabled = false,
  ...props
}: P) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(0);
  const listRef = useRef<Array<HTMLElement | null>>([]);

  const { x, y, reference, floating, strategy, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: 'bottom-end',
    whileElementsMounted: autoUpdate,
  });

  const { getReferenceProps, getFloatingProps, getItemProps } = useInteractions(
    [
      useClick(context),
      useDismiss(context),
      useListNavigation(context, {
        listRef,
        activeIndex,
        onNavigate: setActiveIndex,
      }),
    ],
  );

  const dropdownRef = useRef<HTMLElement>(null);

  useOutsideEventListener(
    dropdownRef,
    'click',
    open,
    () => open && setOpen(false),
  );

  const customTrigger = renderTrigger?.(
    getReferenceProps({
      className: 'text-sm text-gray-500 cursor-pointer',
      ref: reference,
      onClick(evt) {
        evt.stopPropagation();
      },
    }),
    { label, open },
  );

  return (
    <div {...props}>
      {customTrigger ?? (
        <button
          ref={reference}
          type="button"
          disabled={disabled}
          className="text-gray-600 inline-flex disabled:hover:bg-inherit hover:bg-gray-50 focus:outline-none font-medium rounded-lg text-sm text-center items-center dark:bg-blue-600 dark:disabled:hover:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800"
          {...getReferenceProps()}
        >
          {(options ?? []).find(
            o => o.value === props.value && props.value !== undefined,
          )?.text ?? label}
          {showArrow && (
            <ChevronDown
              style={{
                width: '1.25em',
                marginLeft: '0.33em',
                strokeWidth: '2px',
                transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
                transitionDuration: '200ms',
                color: disabled ? '#ccc' : undefined,
              }}
            />
          )}
        </button>
      )}
      <FloatingPortal>
        {open && (
          <div
            ref={floating}
            style={{
              position: strategy,
              top: y ?? 0,
              left: x ?? 0,
              width: 'max-content',
            }}
            className={`
              z-10
              w-44
              bg-white
              border
              rounded
              divide-y
              divide-gray-100
              shadow
              dark:bg-gray-700
              absolute
              scroll-bar-width-narrow
              ${scroll && 'max-h-[20em] overflow-y-auto'}
            `}
            {...getFloatingProps()}
          >
            <ul
              className="py-1 text-sm text-gray-700 dark:text-gray-200"
              aria-labelledby="dropdownDefault"
            >
              {(options ?? []).map((option, i) => {
                if (option.divider) {
                  return <li className="h-[1px] bg-gray-200 my-1" key={i}></li>;
                }

                return (
                  <li key={option.value}>
                    <button
                      tabIndex={-1}
                      ref={el => (listRef.current[i] = el)}
                      className="block w-full text-left py-2 px-4 hover:bg-gray-100 dark:hover:bg-gray-600 dark:hover:text-white focus:bg-gray-100"
                      {...getItemProps({
                        onClick(evt) {
                          evt.stopPropagation();
                          onSelect?.(option.value);
                          option.onSelect?.();
                          setOpen(false);
                        },
                      })}
                    >
                      {option.text}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </FloatingPortal>
    </div>
  );
}