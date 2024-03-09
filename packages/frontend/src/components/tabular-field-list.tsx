import { Field, FieldProps } from 'formik';
import { ComponentProps } from 'react';
import { X as Cross, Plus } from 'react-feather';

type ColumnDef<
  T,
  C extends React.JSXElementConstructor<any>,
  V,
  K extends keyof ColumnMap,
  ColumnMap extends Record<K, V>,
> = {
  // eslint-disable-line
  key: Extract<keyof T, string>;
  getValue?: (row: T) => V; // eslint-disable-line
  component: C;
  header: string;
  props?: ComponentProps<C> | ((row: T) => ComponentProps<C>);
};

type Props<
  T extends { key: string | number },
  ColumnMap extends Record<string, unknown>,
> = {
  value: T[];
  columns: ColumnDef<T, any, any, keyof ColumnMap, ColumnMap>[]; // eslint-disable-line
  createNew?: () => T;
  disableRemove?: boolean;
  readOnly?: boolean;
  onChange?: (value: T[]) => void;
  errors?: Record<string, string>;
  name?: string;
};

type Tools<T> = {
  push: (value: T) => void;
  remove: (index: number) => void;
  replace: (index: number, value: T) => void;
};

export const TabularFieldListFormik = <
  T extends { key: string | number },
  C extends Record<string, unknown>,
>(
  props: Omit<Props<T, C>, 'onChange'> & {
    name: string;
    onChange: (evt: { target: { value: T[]; name: string } }) => void;
  },
) => (
  <Field name={props.name}>
    {({ field }: FieldProps) => (
      <TabularFieldList
        {...props}
        {...field}
        onChange={(value: T[]) =>
          props.onChange({ target: { name: field.name, value } })
        }
      />
    )}
  </Field>
);

export const TabularFieldList = <
  T extends { key: string | number },
  C extends Record<string, unknown>,
>({
  columns,
  value,
  createNew,
  disableRemove,
  readOnly,
  onChange,
  errors,
  name,
}: Props<T, C>) => {
  const render = (tools: Tools<T>) => [
    ...value.flatMap((row, rowIndex) => {
      const fields = columns.map(
        ({ component: Component, getValue, key, props }, i) => {
          let evaluatedProps = props;

          if (typeof evaluatedProps === 'function') {
            evaluatedProps = evaluatedProps(row);
          }

          return (
            <div
              className={`relative focus-within:z-20 ${
                !!errors?.[`${rowIndex}.${key}`] && 'z-10'
              } relative`}
              style={{ marginLeft: i > 0 ? '-1px' : 'unset' }}
              key={row.key}
              data-row={rowIndex}
              data-column={key}
            >
              <Component
                name={`${name}.${rowIndex}.${key}`}
                value={getValue ? getValue(row) : row[key]}
                error={!!errors?.[`${name}.${rowIndex}.${key}`]}
                onChange={(evt: any) => {
                  tools.replace(rowIndex, {
                    ...row,
                    [key]: evt.target.value,
                  });
                }}
                flushRight={i < columns.length - 1}
                flushLeft={i > 0}
                {...evaluatedProps}
              />
            </div>
          );
        },
      );

      if (!readOnly && !disableRemove) {
        fields.push(
          <div className="mt-1 flex items-center px-2 text-gray-600">
            <button onClick={() => tools.remove(rowIndex)}>
              <Cross />
            </button>
          </div>,
        );
      }

      fields.push(
        ...columns.map(({ key }) => {
          const error = errors?.[`${name}.${rowIndex}.${key}`];

          return (
            <div className="px-1 text-sm text-red-500" key={key}>
              {error && `${error}`}
            </div>
          );
        }),
      );

      if (!(readOnly || disableRemove)) {
        fields.push(<div />);
      }

      return fields;
    }),
    !readOnly && createNew !== undefined && (
      <div className="col-span-full flex justify-end pr-2 pt-1 text-gray-600">
        <button
          onClick={() => tools.push(createNew())}
          data-testid="tabular-field-list-add-button"
        >
          <Plus />
        </button>
      </div>
    ),
  ];

  let tools: Tools<T> = {
    push: newItem => onChange?.([...value, newItem]),
    remove: index => {
      const copy = [...value];
      copy.splice(index, 1);
      onChange?.(copy);
    },
    replace: (index, newValue) => {
      const copy = [...value];
      copy.splice(index, 1, newValue);
      onChange?.(copy);
    },
  };

  if (readOnly) {
    tools = {
      /* eslint-disable @typescript-eslint/no-empty-function */
      push: () => {},
      remove: () => {},
      replace: () => {},
      /* eslint-enable @typescript-eslint/no-empty-function */
    };
  }

  return (
    <div
      className="col-span-full mt-1 flex grid items-center"
      style={{
        gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))${
          readOnly || disableRemove ? '' : ' min-content'
        }`,
      }}
    >
      {columns.map(column => (
        <div
          className="pl-1.5 text-xs font-bold text-gray-500"
          key={column.key}
        >
          {column.header}
        </div>
      ))}
      {!(readOnly || disableRemove) && <div />}
      {render(tools)}
    </div>
  );
};
