import { memo, useMemo, useRef, useState, useEffect, useLayoutEffect } from 'react'
import { useField } from 'formik'
import _ from 'loash'
import { equals } from 'remeda'
import { ChevronDown } from 'react-feather'

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

export const DropdownField = memo(<V extends unknown>({
  name,
  value,
  onChange,
  options,
  flushLeft,
  flushRight,
  createCustomOption,
  formatCustomOption,
  allowCustom
}: DropdownFieldProps<V>) => {
  const [, meta] = useField(name);
  const inputRef = useRef<HTMLInputElement>()
  const [search, setSearch] = useState('')
  const [focused, setFocused] = useState(null)

  const itemRefs = useRef([])

  const visibleOptions = useMemo(
    () => options.filter(option => !search || option.text && option.text.indexOf(search) > -1),
    [search, options],
  );

  useEffect(() => {
    if (visibleOptions.find(option => equals(option, focused)) === undefined) {
      setFocused(visibleOptions[0]?.value);
    }
  }, [focused, visibleOptions]);

  useLayoutEffect(() => {
    if (focused) {
      const index = visibleOptions.findIndex((o) => equals(o.value, focused));

      if (index > -1) {
        itemRefs.current[index].focus();
      }
    }
  }, [focused, itemRefs]);

  const [open, setOpen] = useState(false)
  const selectedOption = options.find(opt => equals(opt.value, value))

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
    <div
      className="relative"
      onKeyDown={(evt) => {
        if (evt.key === 'ArrowDown') {
          if (focused === null) {
            setFocused(visibleOptions[0].value);
            setOpen(true);
          } else {
            const index = visibleOptions.findIndex((o) => equals(o.value, focused));

            if (index < visibleOptions.length - 1) {
              setOpen(true);
              setFocused(visibleOptions[index + 1].value);
            } else if (index === visibleOptions.length - 1) {
              setOpen(true);
              setFocused(visibleOptions[0].value);
            } else {
              setFocused(null);
              setOpen(false);
            }
          }
        } else if (evt.key === 'ArrowUp') {
          if (focused === null) {
            setFocused(visibleOptions[visibleOptions.length - 1].value);
            setOpen(true);
          } else {
            const index = visibleOptions.findIndex((o) => equals(o.value, focused));

            if (index === 0) {
              setFocused(null);
              setOpen(false);
              inputRef.current.focus();
            } else {
              setFocused(visibleOptions[index - 1].value);
            }
          }
        } else {
          inputRef.current.focus();
          inputRef.current.dispatchEvent(new KeyboardEvent('keydown', { ...evt.nativeEvent }));
          setOpen(true);
        }
      }}
    >
      <div
        tabIndex={allowCustom ? -2 : 0}
        onClick={() => {
          setOpen(!open)
          if (allowCustom && inputRef.current) {
            inputRef.current.focus()
          }
        }}
        className={`
          relative
          bg-white
          cursor-pointer
          w-full
          ${rounding}
          border
          py-2
          px-3
          ${!meta.error ? 'border-gray-200' : 'border-red-400'}
          mt-1
          shadow-sm
          active:ring-2
          ring-red-600
          flex
          items-center
          overflow-hidden
        `}
      >
        {
          allowCustom
            ? <>
              <input
                ref={inputRef}
                type="text"
                className="flex-grow bg-transparent border-0 p-0 outline-0 box-shadow-[none] absolute inset-0 h-full w-full py-2 px-3"
                onChange={(evt) => setSearch(evt.target.value)}
                value={search === '' ? selectedLabel : search}
              />
              <div className="flex-grow" />
            </>
            : <span className="flex-grow">{selectedLabel ?? 'Select'}</span>
        }
        <div className="flex items-center gap-1">
          {allowCustom && !selectedOption && (
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
      <div
        className={`
          absolute
          z-50
          w-full
          bg-white
          border
          rounded-md
          mt-1
          overflow-hidden
          shadow-lg
        `}
        style={{
          display: open ? 'block' : 'none'
        }}
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
                onClick={(evt) => {
                  setSearch('')
                  onChange({ target: { name, value: option.value } });
                  setOpen(false);
                }}
                onKeyDown={(evt) => {
                  if (evt.key === 'Enter') {
                    setSearch('')
                    onChange({ target: { name, value: option.value } });
                    setOpen(false);
                    evt.stopPropagation();
                  }
                }}
                ref={(el) => {
                  itemRefs.current[optionIndex] = el;
                }}
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
              onClick={() => {
                const option = createCustomOption(search);
                setSearch('')
                onChange({ target: { name, value: option } });
                setOpen(false);
              }}
            >Create "{search}"</li>
          )}
        </ul>
      </div>
    </div>
  );
});
