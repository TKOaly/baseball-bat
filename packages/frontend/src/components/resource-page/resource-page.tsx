import React, {
  MouseEvent,
  PropsWithChildren,
  ReactNode,
  useState,
} from 'react';
import { ExternalLink } from 'react-feather';
import { useLocation } from 'wouter';
import { Button, SecondaryButton } from '@bbat/ui/button';
import { formatEuro, EuroValue } from '@bbat/common/src/currency';
import format from 'date-fns/format';

export const ActionButton: React.FC<
  {
    secondary?: boolean;
    onClick: (evt: MouseEvent<HTMLButtonElement>) => void | Promise<void>;
  } & React.ComponentProps<typeof Button>
> = ({ secondary, children, ...props }) => {
  const [active, setActive] = useState(false);
  const ButtonComponent = secondary ? SecondaryButton : Button;

  const handle: React.MouseEventHandler<HTMLButtonElement> = async evt => {
    if (props.onClick) {
      setActive(true);
      await Promise.resolve(props.onClick(evt));
      setActive(false);
    }
  };

  return (
    <ButtonComponent loading={active} {...props} onClick={handle}>
      {children}
    </ButtonComponent>
  );
};

export const Section: React.FC<
  PropsWithChildren<{ title: string; columns?: 1 | 2 }>
> = ({ title, columns = 1, children }) => (
  <div className={'resource-section mb-10 mt-5'}>
    <div className="mb-5 mt-4 flex items-center">
      <div className="h-[1px] w-3 bg-gray-300" />
      <div className="resource-section-title mx-2 text-xs font-bold uppercase text-gray-500">
        {title}
      </div>
      <div className="h-[1px] flex-grow bg-gray-300" />
    </div>
    <div
      className={`px-1 ${
        columns === 2 && 'grid grid-cols-2 gap-8'
      } resource-section-content`}
    >
      {children}
    </div>
  </div>
);

export const SectionContent: React.FC<{ children?: ReactNode }> = ({
  children,
}) => <DataWrapper>{children}</DataWrapper>;

const DataWrapper: React.FC<{ children?: ReactNode }> = ({ children }) => (
  <div data-cy="resource-field-content">{children}</div>
);

export type FieldProps = { label: string; fullWidth?: boolean };

export const Field: React.FC<PropsWithChildren<FieldProps>> = ({
  label,
  fullWidth,
  children,
}) => (
  <div className={`${fullWidth ? 'col-span-full' : ''} resource-field`}>
    <div className="resource-field-label text-xs font-bold uppercase text-gray-500">
      {label}
    </div>
    <div className="resource-field-content mt-1">
      <DataWrapper>{children}</DataWrapper>
    </div>
  </div>
);

export const SectionDescription: React.FC<{ children?: ReactNode }> = ({
  children,
}) => <p className="mb-5">{children}</p>;

export const Actions: React.FC<{ children?: ReactNode }> = ({ children }) => {
  return (
    <div className="flex flex-col items-end gap-2 text-base lg:flex-row lg:items-center">
      {children}
    </div>
  );
};

export const Title: React.FC<{ children?: ReactNode }> = ({ children }) => {
  return <div className="flex-grow">{children}</div>;
};

export const Header: React.FC<{ children?: ReactNode }> = ({ children }) => {
  return <h1 className="mb-5 mt-10 flex text-2xl">{children}</h1>;
};

export const Page: React.FC<{ children?: ReactNode }> = ({ children }) => {
  return <div>{children}</div>;
};

export const TextField: React.FC<FieldProps & { value: string }> = ({
  value,
  ...props
}) => <Field {...props}>{value}</Field>;

export const LinkField: React.FC<FieldProps & { to: string; text: string }> = ({
  to,
  text,
  ...props
}) => {
  const [, setLocation] = useLocation();

  return (
    <Field {...props}>
      <a
        href="#"
        className="flex cursor-pointer items-center gap-1"
        onClick={() => setLocation(to)}
      >
        {text}
        <ExternalLink className="relative h-4 text-blue-500" />
      </a>
    </Field>
  );
};

export const CurrencyField: React.FC<FieldProps & { value: EuroValue }> = ({
  value,
  ...props
}) => <Field {...props}>{formatEuro(value)}</Field>;

export const DateField: React.FC<
  FieldProps & { value: Date | string; time?: boolean }
> = ({ time, value, ...props }) => {
  try {
    const date = typeof value === 'string' ? new Date(value) : value;
    const text = time
      ? format(date, 'dd.MM.yyyy HH:mm')
      : format(date, 'dd.MM.yyyy');

    return <Field {...props}>{text}</Field>;
  } catch (e) {
    return <Field {...props}>Invalid value</Field>;
  }
};

const badgeColorClasses = {
  gray: 'bg-gray-300',
  blue: 'bg-blue-500',
  green: 'bg-green-500',
  red: 'bg-red-500 text-white',
};

export type BadgeColor = keyof typeof badgeColorClasses;

export const BadgeField: React.FC<
  FieldProps & { color: BadgeColor; text: string }
> = ({ color, text, ...props }) => (
  <Field {...props}>
    <div
      className={`inline-block rounded-full px-2.5 py-1 text-sm ${badgeColorClasses[color]}`}
    >
      {text}
    </div>
  </Field>
);
