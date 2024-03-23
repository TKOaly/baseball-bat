import { memo, useId, useMemo, useRef, useState } from 'react';
import { equals } from 'remeda';
import { ChevronDown } from 'react-feather';
import {
  FloatingPortal,
  size,
  useClick,
  useDismiss,
  useFloating,
  useFocus,
  useInteractions,
  useListNavigation,
} from '@floating-ui/react';

export type DropdownFieldProps<V> = {
  name: string;
  value: V;
  flushRight?: boolean;
  flushLeft?: boolean;
  onChange: (evt: { target: { name: string; value: V } }) => void;
  options: { text: string; value: V; label?: string }[];
  createCustomOption?: (search: string) => V | Promise<V>;
  formatCustomOption?: (value: V) => string;
  allowCustom?: boolean;
};

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-constraint
export const DropdownField = memo(
  <V,>({
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
    const controlsId = useId();
    const inputRef = useRef<HTMLInputElement>(null);
    const [search, setSearch] = useState<string | null>(null);
    const [activeIndex, setActiveIndex] = useState<number | null>(null);

    const itemRefs = useRef<Array<HTMLElement>>([]);

    const visibleOptions = useMemo(
      () =>
        options.filter(
          option =>
            !search || (option.text && option.text.indexOf(search) > -1),
        ),
      [search, options],
    );

    const [open, setOpen] = useState(false);
    const selectedOption = options.find(opt => equals(opt.value, value));

    const { x, y, refs, strategy, context } = useFloating({
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

    const { getReferenceProps, getFloatingProps, getItemProps } =
      useInteractions([
        useClick(context, {
          keyboardHandlers: false,
        }),
        useFocus(context),
        useDismiss(context),
        useListNavigation(context, {
          listRef: itemRefs,
          activeIndex,
          onNavigate: index => {
            setActiveIndex(index);
            if (index !== null) {
              itemRefs.current[index]?.scrollIntoView?.({
                block: 'nearest',
              });
            }
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
          role="combobox"
          aria-controls={controlsId}
          aria-expanded={open}
          aria-haspopup="listbox"
          className={`
            relative
            w-full
            cursor-pointer
            bg-white
            ${rounding}
            mt-1
            flex
            items-center
            overflow-hidden
            border
            px-3
            py-2
            shadow-sm
            ring-red-600
            active:ring-2
          `}
          ref={refs.setReference}
          {...getReferenceProps({
            onClick: () => {
              if (allowCustom && inputRef.current) {
                inputRef.current.focus();
              }
            },
          })}
        >
          {allowCustom ? (
            <>
              <input
                ref={inputRef}
                type="text"
                className="box-shadow-[none] absolute inset-0 h-full w-full flex-grow border-0 bg-transparent p-0 px-3 py-2 outline-0"
                onChange={evt => setSearch(evt.currentTarget.value)}
                value={search ?? selectedLabel}
              />
              <div className="flex-grow" />
            </>
          ) : (
            <span className="flex-grow">{selectedLabel ?? 'Select'}</span>
          )}
          <div className="flex items-center gap-1">
            {allowCustom && !selectedOption && value && (
              <span className="rounded-sm bg-blue-500 px-1 py-0.5 text-xs text-white">
                New
              </span>
            )}
            <ChevronDown
              className="text-gray-500 transition"
              style={{
                transform: open ? 'rotate(180deg)' : undefined,
              }}
            />
          </div>
        </div>
        <FloatingPortal>
          {open && (
            <div
              id={controlsId}
              role="listbox"
              className={`
                z-50
                mt-1
                overflow-hidden
                rounded-md
                border
                bg-white
                shadow-lg
              `}
              style={{
                position: strategy,
                top: y ?? 0,
                left: x ?? 0,
              }}
              ref={refs.setFloating}
              {...getFloatingProps()}
            >
              <ul
                className={`
                  flex
                  max-h-[10em]
                  flex-col
                  gap-y-1
                  overflow-y-auto
                  overflow-x-hidden
                  p-1
                `}
                style={{ scrollbarWidth: 'thin' }}
              >
                {visibleOptions.map((option, optionIndex) => (
                  <li
                    role="option"
                    key={JSON.stringify(option.value)}
                    className={`
                      flex
                      cursor-pointer
                      items-center
                      rounded-sm
                      px-2
                      py-1
                      hover:bg-gray-50
                      ${value === option.value && 'bg-gray-50'}
                    `}
                    tabIndex={-1}
                    {...getItemProps({
                      ref(node) {
                        if (node === null) {
                          delete itemRefs.current[optionIndex];
                        } else {
                          itemRefs.current[optionIndex] = node;
                        }
                      },
                      onClick() {
                        setSearch(null);
                        onChange({ target: { name, value: option.value } });
                        setOpen(false);
                      },
                    })}
                  >
                    <span className="flex-grow">{option.text}</span>
                    {option.label && (
                      <span className="text-sm text-gray-500">
                        {option.label}
                      </span>
                    )}
                  </li>
                ))}
                {search && allowCustom && (
                  <li
                    className={`
                      cursor-pointer
                      rounded-sm
                      px-2
                      py-1
                      text-gray-700
                      hover:bg-gray-50
                    `}
                    tabIndex={-1}
                    ref={node => {
                      if (node === null) {
                        delete itemRefs.current[visibleOptions.length];
                      } else {
                        itemRefs.current[visibleOptions.length] = node;
                      }
                    }}
                    onClick={async () => {
                      if (createCustomOption) {
                        const option = await Promise.resolve(
                          createCustomOption(search),
                        );
                        onChange({ target: { name, value: option } });
                      }
                      setSearch(null);
                      setOpen(false);
                    }}
                  >
                    Create {'"'}
                    {search}
                    {'"'}
                  </li>
                )}
              </ul>
            </div>
          )}
        </FloatingPortal>
      </div>
    );
  },
);

DropdownField.displayName = 'DropdownField';
