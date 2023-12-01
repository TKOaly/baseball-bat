import { ButtonHTMLAttributes, ComponentProps } from 'react';
import { Loader } from 'react-feather';
import styled from 'styled-components';
import { cva } from 'class-variance-authority';
import { twMerge } from 'tailwind-merge';

const commonClasses = `
  inline-flex
  gap-1.5
  items-center
  rounded-md
  py-1.5
  px-3
  font-bold
  shadow-sm
`;

const buttonCva = cva(commonClasses, {
  variants: {
    style: {
      secondary: `
        bg-gray-200
        text-gray-600
        hover:bg-gray-300
        active:ring-2
      `,
      primary: `
        bg-blue-500
        text-white
        hover:bg-blue-600
        active:ring-2
      `,
    },
    disabled: {
      true: `
        bg-gray-100
        cursor-not-allowed
        text-gray-400
        hover:bg-gray-100
        active:ring-2
      `,
      false: '',
    },
    size: {
      small: 'rounded py-0.5 px-1.5 text-xs',
      normal: '',
    },
  },
});

const noop = () => {}; // eslint-disable-line

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  React.PropsWithChildren<{
    secondary?: boolean;
    small?: boolean;
    disabled?: boolean;
    loading?: boolean;
  }>;

export const Button: React.FC<ButtonProps> = ({
  secondary = false,
  small = false,
  disabled = false,
  children,
  loading = false,
  onClick = noop,
  className,
  ...rest
}) => {
  return (
    <button
      {...rest}
      className={twMerge(
        buttonCva({
          style: secondary ? 'secondary' : 'primary',
          disabled,
          size: small ? 'small' : 'normal',
          className,
        }),
      )}
      onClick={onClick}
    >
      <Loader
        className={`animate-[spin_3s_linear_infinite] -ml-1 h-5 duration-200 ${
          loading ? 'w-5' : 'w-0'
        } overflow-hidden`}
      />
      {children}
    </button>
  );
};

export const DisabledButton = (
  props: Omit<ComponentProps<typeof Button>, 'disabled'>,
) => <Button disabled {...props} />;

export const SecondaryButton = (
  props: Omit<ComponentProps<typeof Button>, 'secondary'>,
) => <Button secondary {...props} />;

export const RedButton = styled(Button)`
  background: #f44336;

  &:hover {
    background: #e31000;
  }
`;
