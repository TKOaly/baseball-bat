import { FieldArray, useFormikContext } from 'formik'
import { ComponentProps, ComponentType, JSXElementConstructor } from 'react';
import { X as Cross, Plus } from 'react-feather'

type ColumnDef<C extends JSXElementConstructor<any>> = {
  key: string,
  component: C,
  header: string,
  props?: ComponentProps<C>,
}

type Props<T extends Object> = {
  value: T[],
  name: string,
  columns: ColumnDef<any>[],
  createNew: () => T,
  readOnly?: boolean,
}

export const TabularFieldList = <T extends Object>({
  columns,
  name,
  value,
  createNew,
  readOnly,
}: Props<T>) => {
  const formikContext = useFormikContext()

  const errors = formikContext?.errors ?? {};

  const render = (tools) => [
    ...value.flatMap((row, rowIndex) => {
      const fields = columns.map(({ component: Component, key, props }, i) => (
        <div className={`relative focus-within:z-20 ${(!!errors[`${name}.${rowIndex}.${key}`]) && 'z-10'} relative`} style={{ marginLeft: i > 0 && '-1px' }}>
          <Component
            name={`${name}.${rowIndex}.${key}`}
            value={row[key]}
            error={!!errors[`${name}.${rowIndex}.${key}`]}
            onChange={(evt) => {
              tools.replace(rowIndex, {
                ...row,
                [key]: evt.target.value,
              });
            }}
            flushRight={i < columns.length - 1}
            flushLeft={i > 0}
            {...props}
          />
        </div>
      ));

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
          const error = errors[`${name}.${rowIndex}.${key}`]

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

  return (
    <div
      className="flex mt-1 col-span-full grid items-center"
      style={{
        gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))${readOnly ? '' : ' min-content'}`,
      }}
    >
      {
        columns.map((column) => (
          <div className="text-xs font-bold text-gray-600">{column.header}</div>
        ))
      }
      {!readOnly && <div />}
      {
        readOnly
          ? render({ push: () => { }, remove: () => { } })
          : <FieldArray name={name} render={render} />
      }
    </div>
  );
};
