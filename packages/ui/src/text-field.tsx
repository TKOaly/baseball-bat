import React, { InputHTMLAttributes, ReactNode } from 'react';
import * as R from 'remeda';

type Props = InputHTMLAttributes<HTMLInputElement> & {
  flushLeft?: boolean;
  flushRight?: boolean;
  readOnly?: boolean;
  error?: boolean;
  iconRight?: ReactNode;
};

export const TextField = React.forwardRef<HTMLInputElement, Props>(
  (props, ref) => {
    let rounding: string;

    if (props.flushLeft && props.flushRight) {
      rounding = 'border-l-0';
    } else if (props.flushLeft) {
      rounding = 'rounded-r-md border-l-0';
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
      ${props.readOnly && 'text-gray-500 cursor-not-allowed'}
      focus:z-10
      relative
      mt-1
      shadow-sm
      py-2
      px-3
      border
    `;

    return (
      <div className={`relative ${props.className}`}>
        {props.readOnly ? (
          <div
            className={classes}
            style={{ height: '42px', ...props.style }}
            {...R.omit(props, ['className', 'style'])}
          >
            {props.value}
          </div>
        ) : (
          <input
            type="text"
            className={classes}
            {...R.omit(props, ['className'])}
            ref={ref}
          />
        )}
        {props.iconRight && (
          <div className="absolute inset-y-0 right-0 flex h-full items-center pr-3 pt-1 text-gray-400">
            {props.iconRight}
          </div>
        )}
      </div>
    );
  },
);

TextField.displayName = 'TextField';
