import { ComponentProps } from 'react';
import { Loader } from 'react-feather';
import styled from 'styled-components';
import { Link } from 'wouter';

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

const classNames = {
  default: `
    ${commonClasses}
    bg-blue-500
    text-white
    hover:bg-blue-600
    active:ring-2
  `,
  secondary: `
    ${commonClasses}
    bg-gray-200
    text-gray-600
    hover:bg-gray-300
    active:ring-2
  `,
  disabled: `
    ${commonClasses}
    bg-gray-100
    cursor-not-allowed
    text-gray-400
    hover:bg-gray-100
    active:ring-2
  `,
};

const noop = () => { }; // eslint-disable-line

export const Button = ({ secondary = false, disabled = false, children, loading = false, onClick = noop }) => {
  let styleName = 'default';

  if (secondary) {
    styleName = 'secondary';
  }

  if (disabled) {
    styleName = 'disabled';
  }

  return (
    <button className={classNames[styleName]} onClick={onClick}>
      <Loader className={`animate-[spin_3s_linear_infinite] -ml-1 h-5 duration-200 ${loading ? 'w-5' : 'w-0'} overflow-hidden`} />
      {children}
    </button>
  );
};

export const DisabledButton = (props: Omit<ComponentProps<typeof Button>, 'disabled'>) => <Button disabled {...props} />;

export const SecondaryButton = (props: Omit<ComponentProps<typeof Button>, 'secondary'>) => <Button secondary {...props} />;

export const RedButton = styled(Button)`
  background: #f44336;

  &:hover {
    background: #e31000;
  }
`;

export const ButtonA = styled.a`
  background: #22bd44;
  border-radius: 5px;
  border: none;
  width: 80%;
  height: 40px;
  margin: 10px 0;
  transition: all 0.2s ease-in-out;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    background: #159f33;
  }

  color: #ffffff;
  font-size: 1.2rem;
  font-weight: bold;
  text-decoration: none;
`;

export const BackLink = styled(Link)`
  background: #f44336;
  border-radius: 5px;
  border: none;
  width: 80%;
  height: 40px;
  margin: 10px 0;
  padding: 0 10px;
  transition: all 0.2s ease-in-out;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    background: #e31000;
  }

  color: #ffffff;
  font-size: 1.2rem;
  font-weight: bold;
  text-decoration: none;
`;
