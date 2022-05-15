import { useRef, useState } from "react";
import { ChevronDown } from "react-feather";
import { useOutsideEventListener } from '../hooks/useOutsideEventListener'

export const Dropdown = ({ label, scroll = false, renderTrigger = null, showArrow = true, options, onSelect, ...props }) => {
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef()

  useOutsideEventListener(dropdownRef, 'click', open, () => open && setOpen(false))

  const customTrigger = renderTrigger?.({
    onClick: (e) => {
      setOpen(!open);
      e.stopPropagation();
    },
  }, { label, open });

  return (
    <div {...props} ref={dropdownRef}>
      {customTrigger ?? (
        <button
          className="text-gray-600 inline-flex hover:bg-gray-50 focus:outline-none font-medium rounded-lg text-sm text-center items-center dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800"
          type="button"
          onClick={(e) => {
            setOpen(!open);
            e.stopPropagation();
          }}
        >
          {label}
          {showArrow && <ChevronDown style={{ width: '1.25em', marginLeft: '0.33em', strokeWidth: '2px' }} />}
        </button>
      )}
      <div
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
          ${!open && 'hidden'}
          ${scroll && 'max-h-[20em] overflow-y-auto'}
        `}
      >
        <ul className="py-1 text-sm text-gray-700 dark:text-gray-200" aria-labelledby="dropdownDefault">
          {(options ?? []).map(option => {
            if (option.divider) {
              return (
                <li className="h-[1px] bg-gray-200 my-1"></li>
              )
            }

            return (
              <li>
                <button
                  onClick={(evt) => {
                    evt.stopPropagation();
                    onSelect?.(option.value)
                    option.onSelect?.()
                  }}
                  className="block w-full text-left py-2 px-4 hover:bg-gray-100 dark:hover:bg-gray-600 dark:hover:text-white"
                >
                  {option.text}
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  );
};

