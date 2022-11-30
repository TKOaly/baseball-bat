/* eslint-disable @typescript-eslint/no-explicit-any */

import { useField } from 'formik';
import { ComponentProps, ComponentType } from 'react';

export type Props<C extends ComponentType<any>> = { // eslint-disable-line
  component: ComponentType<C>,
  label: string,
  fullWidth?: boolean,
  name: string,
  narrow?: boolean
} & ComponentProps<C>

export const InputGroup = <C extends ComponentType<any>>({ component, narrow, fullWidth, label, ...props }: Props<C>) => {
  const [field, meta] = useField(props.name);

  const Component = component;

  return (
    <div className={`flex flex-col ${narrow !== true && !fullWidth && 'col-span-2'} ${fullWidth && 'col-span-full'} my-4`}>
      <span className={`text-sm font-bold ${meta.error ? 'text-red-500' : 'text-gray-800'}`}>{label}</span>
      <div>
        <Component {...field} {...props} error={meta.error} placeholder={props.placeholder ?? label} />
      </div>
      {meta.error && typeof meta.error === 'string' && <span className="text-xs text-red-600 mt-1">{'' + meta.error}</span>}
    </div>
  );
};

export const StandaloneInputGroup = <C extends ComponentType<any>>({ component, fullWidth, label, error, ...props }: Props<C> & { error?: string }) => {
  const Component = component;

  return (
    <div className={`flex flex-col ${fullWidth && 'col-span-full'} my-4`}>
      <span className={`text-sm font-bold ${error ? 'text-red-500' : 'text-gray-800'}`}>{label}</span>
      <div>
        <Component {...props} error={error} placeholder={props.placeholder ?? label} />
      </div>
      {error && typeof error === 'string' && <span className="text-xs text-red-600 mt-1">{'' + error}</span>}
    </div>
  );
};
