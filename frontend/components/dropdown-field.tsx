import React from 'react';
import { memo, useMemo, useRef, useState, useEffect, useLayoutEffect } from 'react';
import { useField } from 'formik';
import { equals } from 'remeda';
import { ChevronDown } from 'react-feather';
import { useOutsideEventListener } from '../hooks/useOutsideEventListener';
import { FloatingPortal, size, useClick, useDismiss, useFloating, useFocus, useInteractions, useListNavigation } from '@floating-ui/react-dom-interactions';

export type DropdownFieldProps<V> = {
  name: string
  value: V
  flushRight?: boolean
  flushLeft?: boolean
  onChange: (evt: { target: { name: string, value: V } }) => void,
  options: { text: string, value: V }[],
  createCustomOption: (search: string) => V,
  formatCustomOption: (value: V) => string,
  allowCustom?: boolean
}

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-constraint
export const DropdownField = memo(<V extends unknown>({
  name,
  value,
  onChange,
  options,
  flushLeft,
  flushRight,
  createCustomOption,
  formatCustomOption,
  allowCustom,
}: DropdownFieldProps<V>) => {
  const inputRef = useRef<HTMLInputElement>();
  const [search, setSearch] = useState(null);
  const [activeIndex, setActiveIndex] = useState(null);

  const itemRefs = useRef([]);

  const visibleOptions = useMemo(
    () => options.filter(option => !search || option.text && option.text.indexOf(search) > -1),
    [search, options],
  );

  const [open, setOpen] = useState(false);
  const selectedOption = options.find(opt => equals(opt.value, value));

  const { x, y, reference, floating, strategy, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: 'bottom',
    middleware: [
      size({
        apply({ elements, rects }) {
          elements.floating.style.width = `${rects.reference.width}px`;
        },
      }),
    ],
  });

  const { getReferenceProps, getFloatingProps, getItemProps } = useInteractions([
    useClick(context, {
      keyboardHandlers: false,
    }),
    useFocus(context),
    useDismiss(context),
    useListNavigation(context, {
      listRef: itemRefs,
      activeIndex,
      onNavigate: (index) => {
        setActiveIndex(index);
        itemRefs.current[index]?.scrollIntoView?.({
          block: 'nearest',
        });
      },
    }),
  ]);

  let selectedLabel = '';

  if (selectedOption) {
    selectedLabel = selectedOption.text;
  } else if (value && formatCustomOption) {
    selectedLabel = formatCustomOption(value);
  }

  let rounding: string;

  if (flushLeft && flushRight) {
    rounding = '';
  } else if (flushLeft) {
    rounding = 'rounded-r-md';
  } else if (flushRight) {
    rounding = 'rounded-l-md';
  } else {
    rounding = 'rounded-md';
  }

  return (
    <div className="relative">
      <div
        tabIndex={allowCustom ? -2 : 0}
        className={`
          relative
          bg-white
          cursor-pointer
          w-full
          ${rounding}
          border
          py-2
          px-3
          mt-1
          shadow-sm
          active:ring-2
          ring-red-600
          flex
          items-center
          overflow-hidden
        `}
        ref={reference}
        {...getReferenceProps({
          onClick: () => {
            if (allowCustom && inputRef.current) {
              inputRef.current.focus();
            }
          }
        })}
      >
        {
          allowCustom
            ? <>
              <input
                ref={inputRef}
                type="text"
                className="flex-grow bg-transparent border-0 p-0 outline-0 box-shadow-[none] absolute inset-0 h-full w-full py-2 px-3"
                onChange={(evt) => setSearch(evt.target.value)}
                value={search ?? selectedLabel}
              />
              <div className="flex-grow" />
            </>
            : <span className="flex-grow">{selectedLabel ?? 'Select'}</span>
        }
        <div className="flex items-center gap-1">
          {allowCustom && !selectedOption && value && (
            <span className="rounded-sm py-0.5 px-1 text-white text-xs bg-blue-500">New</span>
          )}
          <ChevronDown
            className="text-gray-500 transition"
            style={{
              transform: open && 'rotate(180deg)',
            }}
          />
        </div>
      </div>
      <FloatingPortal>
        { open && (
          <div
            className={`
              bg-white
              border
              rounded-md
              mt-1
              overflow-hidden
              shadow-lg
              z-50
            `}
            style={{
              position: strategy,
              top: y ?? 0,
              left: x ?? 0,
            }}
            ref={floating}
            {...getFloatingProps()}
          >
            <ul
              className={`
                flex
                flex-col
                gap-y-1
                max-h-[10em]
                overflow-y-auto
                overflow-x-hidden
                p-1
              `}
              style={{ scrollbarWidth: 'thin' }}
            >
              {visibleOptions
                .map((option, optionIndex) => (
                  <li
                    key={JSON.stringify(option.value)}
                    className={`
                      py-1
                      px-2
                      hover:bg-gray-50
                      rounded-sm
                      cursor-pointer
                      flex
                      items-center
                      ${value === option.value && 'bg-gray-50'}
                    `}
                    tabIndex={-1}
                    {...getItemProps({
                      ref (node) {
                        itemRefs.current[optionIndex] = node;
                      },
                      onClick () {
                        setSearch(null);
                        onChange({ target: { name, value: option.value } });
                        setOpen(false);
                      },
                    })}
                  >
                    <span className="flex-grow">{option.text}</span>
                    {
                      option.label && <span className="text-gray-500 text-sm">{option.label}</span>
                    }
                  </li>
                ))}
              {search && allowCustom && (
                <li
                  className={`
                      py-1
                      px-2
                      hover:bg-gray-50
                      rounded-sm
                      cursor-pointer
                      text-gray-700
                    `}
                  tabIndex={-1}
                  ref={(node) => itemRefs.current[visibleOptions.length] = node}
                  onClick={() => {
                    const option = createCustomOption(search);
                    setSearch(null);
                    onChange({ target: { name, value: option } });
                    setOpen(false);
                  }}
                >Create {'"'}{search}{'"'}</li>
              )}
            </ul>
          </div>
        )}
      </FloatingPortal>
    </div>
  );
});

DropdownField.displayName = 'DropdownField';
