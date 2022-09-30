import { Field } from 'formik';
import { ComponentProps, ComponentType, JSXElementConstructor } from 'react';
import { X as Cross, Plus } from 'react-feather'

type ColumnDef<T, C extends JSXElementConstructor<any>> = {
  key: string,
  getValue?: (row: T) => any,
  component: C,
  header: string,
  props?: ComponentProps<C> | ((row: T) => ComponentProps<C>),
}

type Props<T extends Object> = {
  value: T[],
  columns: ColumnDef<T, any>[],
  createNew: () => T,
  readOnly?: boolean,
  onChange: (value: T[]) => void,
  errors?: Record<string, unknown>,
}

type Tools<T> = {
  push: (value: T) => void,
  remove: (index: number) => void,
  replace: (index: number, value: T) => void,
}

export const TabularFieldListFormik = <T extends Object>(props: Omit<Props<T>, 'onChange'> & { name: string, onChange: (evt: { target: { value: T[], name: string } }) => void }) => (
  <Field name={props.name}>
    {({ field: { onChange, ...field } }) => (
      <TabularFieldList
        {...props}
        {...field}
        onChange={(value: T[]) => props.onChange({ target: { name: field.name, value } })}
      />
    )}
  </Field>
)

export const TabularFieldList = <T extends Object>({
  columns,
  value,
  createNew,
  readOnly,
  onChange,
  errors,
}: Props<T>) => {
  const render = (tools: Tools<T>) => [
    ...value.flatMap((row, rowIndex) => {
      const fields = columns.map(({ component: Component, getValue, key, props }, i) => {
        let evaluatedProps = props;

        if (typeof evaluatedProps === 'function') {
          evaluatedProps = evaluatedProps(row);
        }

        return (
          <div className={`relative focus-within:z-20 ${(!!errors?.[`${rowIndex}.${key}`]) && 'z-10'} relative`} style={{ marginLeft: i > 0 && '-1px' }}>
            <Component
              name={`${name}.${rowIndex}.${key}`}
              value={getValue ? getValue(row) : row[key]}
              error={!!errors?.[`${name}.${rowIndex}.${key}`]}
              onChange={(evt) => {
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
      });

      if (!readOnly) {
        fields.push(
          <div className="px-2 text-gray-600 flex items-center mt-1">
            <button onClick={() => tools.remove(rowIndex)}>
              <Cross />
            </button>
          </div>
        );
      }

      fields.push(
        ...columns.map(({ key }) => {
          const error = errors?.[`${name}.${rowIndex}.${key}`]

          return (
            <div className="text-sm text-red-500 px-1">
              {error && `${error}`}
            </div>
          );
        }),
        !readOnly && <div />
      );

      return fields;
    }),
    !readOnly && <div className="col-span-full flex justify-end pt-1 pr-2 text-gray-600">
      <button onClick={() => tools.push(createNew())}>
        <Plus />
      </button>
    </div>
  ]

  let tools: Tools<T> = {
    push: (newItem) => onChange([...value, newItem]),
    remove: (index) => {
      const copy = [...value]
      copy.splice(index, 1)
      onChange(copy)
    },
    replace: (index, newValue) => {
      const copy = [...value]
      copy.splice(index, 1, newValue)
      onChange(copy)
    },
  };

  if (readOnly) {
    tools = { push: () => { }, remove: () => { }, replace: () => { } }
  }

  return (
    <div
      className="flex mt-1 col-span-full grid items-center"
      style={{
        gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))${readOnly ? '' : ' min-content'}`,
      }}
    >
      {
        columns.map((column) => (
          <div className="text-xs font-bold text-gray-500 pl-1.5">{column.header}</div>
        ))
      }
      {!readOnly && <div />}
      {render(tools)}
    </div>
  );
};
