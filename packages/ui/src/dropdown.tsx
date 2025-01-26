import {
  ButtonHTMLAttributes,
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ChevronDown, ChevronRight, Loader } from 'react-feather';
import {
  useInteractions,
  useFloating,
  useListNavigation,
  useDismiss,
  useClick,
  FloatingPortal,
  autoUpdate,
  useFloatingParentNodeId,
  FloatingTree,
  FloatingNode,
  useFloatingNodeId,
  FloatingList,
  FloatingFocusManager,
  useMergeRefs,
  useListItem,
  offset,
  flip,
  useHover,
  safePolygon,
  shift,
  useRole,
  useFloatingTree,
} from '@floating-ui/react';
import { cva } from 'class-variance-authority';

const itemCva = cva(
  'text-left hover:bg-gray-50 flex items-center flex-nowrap',
  {
    variants: {
      nested: {
        true: 'px-3 py-1.5 focus:bg-gray-50 rounded',
        false: 'px-1',
      },
      open: {
        true: '',
        false: '',
      },
      focusInside: {
        true: '',
        false: '',
      },
      flat: {
        true: '',
        false: '',
      },
    },
    compoundVariants: [
      {
        flat: false,
        nested: false,
        className:
          'px-3 py-1.5 rounded-md shadow-sm border h-[42px] mt-1 inline-block',
      },
      {
        flat: true,
        nested: false,
        className: 'rounded-sm',
      },
    ],
  },
);

type ItemInfo = {
  visible: boolean;
  value: any;
  label: React.ReactNode;
  leaf: boolean;
};

const DropdownComponent = forwardRef<
  HTMLButtonElement,
  React.PropsWithChildren<DropdownProps> &
    ButtonHTMLAttributes<HTMLButtonElement>
>(
  (
    {
      label,
      children,
      flat,
      options,
      searchable,
      onSearchChange,
      scroll,
      keepOpen,
      value,
      showArrow = true,
      ...props
    },
    forwardedRef,
  ) => {
    const parent = useContext(DropdownContext);
    const nodeId = useFloatingNodeId();
    const tree = useFloatingTree();
    const parentId = useFloatingParentNodeId();
    const elementsRef = useRef([]);
    const labelsRef = useRef([] as string[]);
    const [activeIndex, setActiveIndex] = useState<number | null>(null);
    const [isOpen, setOpen] = useState(false);
    const [search, setSearch] = useState(props.search ?? '');
    const item = useListItem();
    const isNested = parentId !== null;
    const itemsRef = useRef<Map<number, ItemInfo>>(new Map());

    useEffect(() => setSearch(props.search ?? ''), [props.search, null]);

    useEffect(() => {
      if (!tree) return;

      const handleClose = () => {
        if (!keepOpen) {
          setOpen(false);
        }
      };

      tree.events.on('close', handleClose);

      return () => {
        tree.events.off('close', handleClose);
      };
    }, [tree]);

    const { context, refs, floatingStyles } = useFloating({
      nodeId,
      open: isOpen,
      onOpenChange: setOpen,
      placement: isNested ? 'right-start' : 'bottom-start',
      whileElementsMounted: autoUpdate,
      middleware: [
        offset({
          mainAxis: isNested ? 10 : 5,
          crossAxis: isNested ? -5 : 0,
        }),
        flip(),
        shift({
          padding: 10,
        }),
      ],
    });

    const info = useMemo(
      () => ({
        visible: true,
        value: undefined,
        label,
        leaf: false,
      }),
      [label],
    );

    useEffect(() => {
      parent.register(item.index, info);
      return () => parent.unregister(item.index);
    }, [item, info]);

    const ExpandIcon = isNested ? ChevronRight : ChevronDown;

    const { getFloatingProps, getReferenceProps, getItemProps } =
      useInteractions([
        useRole(context, {
          role: 'menu',
        }),
        useClick(context, { enabled: !isNested }),
        useDismiss(context),
        useHover(context, {
          enabled: isNested,
          handleClose: safePolygon({
            blockPointerEvents: true,
          }),
        }),
        useListNavigation(context, {
          listRef: elementsRef,
          activeIndex,
          nested: isNested,
          onNavigate: setActiveIndex,
        }),
      ]);

    const [noMatches, setNoMatches] = useState(false);

    const onSelect = (value: any) => {
      props.onSelect?.(value);
    };

    const register = (index: number, item: ItemInfo) => {
      itemsRef.current.set(index, item);

      const currentNoMatches = [...itemsRef.current.values()].every(
        item => !item.visible,
      );

      if (currentNoMatches !== noMatches) {
        setNoMatches(currentNoMatches);
      }
    };

    const unregister = (index: number) => {
      itemsRef.current.delete(index);
    };

    return (
      <FloatingNode id={nodeId}>
        <DropdownContext.Provider
          value={{
            activeIndex,
            setActiveIndex,
            getItemProps,
            search,
            onSelect,
            register,
            unregister,
          }}
        >
          <button
            ref={useMergeRefs([refs.setReference, item.ref, forwardedRef])}
            role={isNested ? 'menuitem' : undefined}
            className={itemCva({
              nested: isNested,
              open: isOpen,
              focusInside: false,
              flat: !!flat,
              className: props.className,
            })}
            tabIndex={
              !isNested ? undefined : parent.activeIndex === item.index ? 0 : -1
            }
            {...getReferenceProps(parent.getItemProps(props))}
          >
            {value
              ? [...itemsRef.current.values()].find(i => i.value === value)
                  ?.label ?? label
              : label}
            {showArrow && (
              <ExpandIcon
                className="relative ml-2 inline-block size-5 shrink-0 text-gray-400"
                style={{
                  transitionDuration: '200ms',
                  transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                }}
              />
            )}
          </button>
          {isOpen && (
            <FloatingList elementsRef={elementsRef} labelsRef={labelsRef}>
              <FloatingPortal>
                <FloatingFocusManager modal={false} context={context}>
                  <div
                    ref={refs.setFloating}
                    style={{
                      ...floatingStyles,
                      display: isOpen ? floatingStyles.display : 'none',
                    }}
                    className="relative z-50 min-w-[13em] overflow-hidden rounded-md border bg-white shadow-sm"
                    {...getFloatingProps()}
                  >
                    {searchable && (
                      <Search
                        value={search}
                        onInput={evt => {
                          setSearch(evt.currentTarget.value);
                          onSearchChange?.(evt.currentTarget.value);
                        }}
                      />
                    )}
                    <div
                      className={`flex w-full flex-col items-stretch p-1 text-sm ${scroll && 'max-h-[15em] overflow-y-auto'}`}
                    >
                      {children}
                      {options?.map(option => {
                        if ('divider' in option && option.divider) {
                          return <div />;
                        }

                        if (
                          typeof option.text === 'object' &&
                          option.text !== null &&
                          'type' in option.text &&
                          option.text.type === Dropdown
                        ) {
                          return option.text;
                        }

                        return (
                          <DropdownItem
                            value={option.value}
                            label={option.text}
                            aside={option.label}
                            onSelect={option.onSelect}
                          />
                        );
                      })}
                      {noMatches && (
                        <div className="mx-2 py-1 text-sm text-gray-500">
                          No matches!
                        </div>
                      )}
                    </div>
                  </div>
                </FloatingFocusManager>
              </FloatingPortal>
            </FloatingList>
          )}
        </DropdownContext.Provider>
      </FloatingNode>
    );
  },
);

const Search = (props: React.InputHTMLAttributes<HTMLInputElement>) => {
  const { ref } = useListItem();

  return (
    <input
      {...props}
      ref={ref}
      className="w-full border-b px-3 py-1.5 text-sm"
      placeholder="Filter..."
    />
  );
};

type DropdownContext = {
  getItemProps: (
    userProps?: React.HTMLProps<HTMLElement>,
  ) => Record<string, unknown>;
  activeIndex: number | null;
  setActiveIndex: React.Dispatch<React.SetStateAction<number | null>>;
  search: string;
  onSelect: (value: unknown) => void;
  register: (index: number, info: ItemInfo) => void;
  unregister: (index: number) => void;
};

const DropdownContext = createContext<DropdownContext>({
  getItemProps: () => ({}),
  activeIndex: null,
  setActiveIndex: () => {},
  search: '',
  register: () => {},
  unregister: () => {},
  onSelect: () => {},
});

interface DropdownItemProps {
  value?: any;
  text?: string;
  label: string | React.ReactNode;
  aside?: string | React.ReactNode;
  disabled?: boolean;
  keepOpen?: boolean;
}

const escapeRegExp = (value: string) =>
  value.replace(/[/\-\\^$*+?.()|[\]{}]/g, '\\$&');

const Highlight = ({ label, search }: { label: string; search: string }) => {
  if (search.length === 0) {
    return label;
  }

  const matches = [
    ...label.matchAll(new RegExp(`(${escapeRegExp(search)})+`, 'ig')),
  ];

  const result = [];
  let cursor = 0;

  for (const match of matches) {
    match;
    const segment = label.substring(cursor, match.index);

    result.push(segment);

    result.push(
      <span className="relative -z-10 -mx-0.5 inline-block whitespace-pre rounded-sm bg-blue-200 px-0.5">
        {label.substring(match.index, match.index + match[0].length)}
      </span>,
    );

    cursor = match.index + match[0].length;
  }

  result.push(label.substring(cursor));

  return <span className="relative z-0">{result}</span>;
};

export const DropdownItem = forwardRef<
  HTMLButtonElement,
  DropdownItemProps & React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ disabled, label, aside, value, text, ...props }, forwardedRef) => {
  const [loading, setLoading] = useState(false);
  const textValue = text ?? label?.toString() ?? '';

  const dropdown = useContext(DropdownContext);
  const item = useListItem({
    label: disabled ? null : textValue,
  });

  const isActive = item.index === dropdown.activeIndex;
  const isHidden =
    dropdown.search !== '' &&
    !textValue.toLowerCase().includes(dropdown.search.toLowerCase());

  const tree = useFloatingTree();

  const info = useMemo(
    () => ({
      visible: !isHidden,
      value,
      label,
      leaf: true,
    }),
    [isHidden, value, label],
  );

  useEffect(() => {
    dropdown.register(item.index, info);
    return () => dropdown.unregister(item.index);
  }, [item, info]);

  return (
    <button
      {...props}
      ref={useMergeRefs([item.ref, forwardedRef])}
      type="button"
      role="menuitem"
      tabIndex={isActive ? 0 : -1}
      disabled={disabled || isHidden}
      className={itemCva({
        nested: true,
        open: true,
        focusInside: false,
        flat: false,
      })}
      style={{ display: isHidden ? 'none' : 'inline-flex' }}
      {...dropdown.getItemProps({
        async onClick(evt: React.MouseEvent<HTMLButtonElement>) {
          setLoading(true);
          try {
            await Promise.resolve(props.onClick?.(evt));
            await Promise.resolve(props.onSelect?.(evt));
            await Promise.resolve(dropdown.onSelect?.(value));
          } finally {
            setLoading(false);
          }

          if (tree) {
            tree.events.emit('close');
          }
        },
        onFocus(evt: React.FocusEvent<HTMLButtonElement>) {
          props.onFocus?.(evt);
        },
      })}
    >
      <Loader
        className={`-ml-1 mr-2 h-5 animate-[spin_3s_linear_infinite] duration-200 ${
          loading ? 'w-5' : 'w-0'
        } overflow-hidden`}
      />
      <span className="grow-1">
        {typeof label === 'string' ? (
          <Highlight label={label} search={dropdown.search} />
        ) : (
          label
        )}
      </span>
      <span className="ml-2 shrink-0 text-gray-400">{aside}</span>
    </button>
  );
});

type Option =
  | {
      divider?: false;
      value?: any;
      text: React.ReactNode;
      label?: React.ReactNode;
      onSelect?: () => void;
    }
  | { divider: true };

interface DropdownProps {
  label: string | React.ReactNode;
  searchable?: boolean;
  search?: string;
  flat?: boolean;
  options?: Option[];
  scroll?: boolean;
  showArrow?: boolean;
  value?: any;
  onSelect?: (value: any) => void;
  keepOpen?: boolean;
  onSearchChange?: (value: string) => void;
}

export const Dropdown = forwardRef<
  HTMLButtonElement,
  React.PropsWithChildren<DropdownProps> &
    Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onSelect'>
>((props, ref) => {
  const parentId = useFloatingParentNodeId();

  if (parentId === null) {
    return (
      <FloatingTree>
        <DropdownComponent {...props} ref={ref} />
      </FloatingTree>
    );
  }

  return <DropdownComponent {...props} ref={ref} />;
});
