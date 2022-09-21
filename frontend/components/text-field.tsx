import { InputHTMLAttributes, ReactNode } from 'react'
import { useField } from 'formik'
import * as R from 'remeda'

type Props = InputHTMLAttributes<HTMLInputElement> & {
  flushLeft?: boolean,
  flushRight?: boolean,
  readOnly?: boolean,
  error?: boolean,
  iconRight?: ReactNode
}

export const TextField = (props: Props) => {
  let rounding: string;

  if (props.flushLeft && props.flushRight) {
    rounding = '';
  } else if (props.flushLeft) {
    rounding = 'rounded-r-md';
  } else if (props.flushRight) {
    rounding = 'rounded-l-md';
  } else {
    rounding = 'rounded-md';
  }

  const classes = `
    bg-white
    w-full
    ${rounding}
    ${props.error ? 'border-red-400' : 'border-gray-200'}
    mt-1
    shadow-sm
    py-2
    px-3
    border
  `;

  return (
    <div className={`relative ${props.className}`}>
      {props.readOnly
        ? <div className={classes} style={{ height: '42px' }}>{props.value}</div>
        : <input type="text" className={classes} {...R.omit(props, ['className'])} />}
      {props.iconRight && (
        <div className="absolute h-full right-0 inset-y-0 flex items-center pr-3 pt-1 text-gray-400">{props.iconRight}</div>
      )}
    </div>
  );
};