import React, { MouseEvent, PropsWithChildren, useState } from 'react';
import { ExternalLink } from 'react-feather';
import { useLocation } from 'wouter';
import { Button, SecondaryButton } from '@bbat/ui/button';
import { formatEuro, EuroValue } from '@bbat/common/src/currency';
import { format } from 'date-fns';

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
  <div
    className={'mt-5 mb-10'}
    data-cy="resource-section"
    data-cy-title={title}
  >
    <div className="flex items-center mt-4 mb-5">
      <div className="h-[1px] w-3 bg-gray-300" />
      <div className="text-gray-500 mx-2 text-xs font-bold uppercase">
        {title}
      </div>
      <div className="h-[1px] bg-gray-300 flex-grow" />
    </div>
    <div
      className={`px-1 ${columns === 2 && 'grid grid-cols-2 gap-8'}`}
      data-cy="resource-section-content"
    >
      {children}
    </div>
  </div>
);

export const SectionContent: React.FC<PropsWithChildren<{}>> = ({
  children,
}) => <DataWrapper>{children}</DataWrapper>;

const DataWrapper: React.FC<PropsWithChildren<{}>> = ({ children }) => (
  <div data-cy="resource-field-content">{children}</div>
);

export type FieldProps = { label: string; fullWidth?: boolean };

export const Field: React.FC<PropsWithChildren<FieldProps>> = ({
  label,
  fullWidth,
  children,
}) => (
  <div
    className={fullWidth ? 'col-span-full' : ''}
    data-cy="resource-field"
    data-cy-label={label}
  >
    <div className="text-gray-500 text-xs font-bold uppercase">{label}</div>
    <div className="mt-1">
      <DataWrapper>{children}</DataWrapper>
    </div>
  </div>
);

export const SectionDescription: React.FC<PropsWithChildren<{}>> = ({
  children,
}) => <p className="mb-5">{children}</p>;

export const Actions: React.FC<PropsWithChildren<{}>> = ({ children }) => {
  return (
    <div className="flex flex-col items-end lg:items-center lg:flex-row gap-2 text-base">
      {children}
    </div>
  );
};

export const Title: React.FC<PropsWithChildren<{}>> = ({ children }) => {
  return <div className="flex-grow">{children}</div>;
};

export const Header: React.FC<PropsWithChildren<{}>> = ({ children }) => {
  return <h1 className="text-2xl mt-10 mb-5 flex">{children}</h1>;
};

export const Page: React.FC<PropsWithChildren<{}>> = ({ children }) => {
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
        className="flex items-center cursor-pointer gap-1"
        onClick={() => setLocation(to)}
      >
        {text}
        <ExternalLink className="h-4 text-blue-500 relative" />
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
      className={`py-1 px-2.5 text-sm inline-block rounded-full ${badgeColorClasses[color]}`}
    >
      {text}
    </div>
  </Field>
);
