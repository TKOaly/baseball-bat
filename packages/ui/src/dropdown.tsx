import { useId, useRef, useState } from 'react';
import { ChevronDown } from 'react-feather';
import {
  useInteractions,
  useFloating,
  useListNavigation,
  useDismiss,
  useClick,
  FloatingPortal,
  autoUpdate,
} from '@floating-ui/react';
import { useOutsideEventListener } from './useOutsideEventListener';

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

  const { x, y, refs, strategy, context } = useFloating({
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
  const menuId = useId();

  useOutsideEventListener(
    dropdownRef,
    'click',
    open,
    () => open && setOpen(false),
  );

  const customTrigger = renderTrigger?.(
    getReferenceProps({
      className: 'text-sm text-gray-500 cursor-pointer',
      ref: refs.setReference,
      'aria-haspopup': 'menu',
      'aria-expanded': open,
      'aria-controls': menuId,
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
          ref={refs.setReference}
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={menuId}
          disabled={disabled}
          className="inline-flex items-center rounded-lg text-center text-sm font-medium text-gray-600 hover:bg-gray-50 focus:outline-none disabled:hover:bg-inherit"
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
            id={menuId}
            ref={refs.setFloating}
            style={{
              position: strategy,
              top: y ?? 0,
              left: x ?? 0,
              width: 'max-content',
            }}
            className={`
              scroll-bar-width-narrow
              absolute
              z-10
              w-44
              divide-y
              divide-gray-100
              rounded
              border
              bg-gray-700
              bg-white
              shadow
              ${scroll && 'max-h-[20em] overflow-y-auto'}
            `}
            {...getFloatingProps()}
          >
            <ul
              className="py-1 text-sm text-gray-200 text-gray-700"
              aria-labelledby="dropdownDefault"
            >
              {(options ?? []).map((option, i) => {
                if (option.divider) {
                  return <li className="my-1 h-[1px] bg-gray-200" key={i}></li>;
                }

                return (
                  <li
                    key={option.value}
                    role="menuitem"
                    className="block w-full px-4 py-2 text-left hover:bg-gray-100 focus:bg-gray-100"
                    tabIndex={-1}
                    ref={el => (listRef.current[i] = el)}
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
