import styled from 'styled-components'
import { Link } from 'wouter'
import { tw } from '../tailwind'

export const Button = tw.button`
  bg-blue-500
  rounded-md
  py-1.5
  px-3
  text-white
  font-bold
  shadow
  hover:bg-blue-600
  active:ring-2
`;

export const DisabledButton = tw.button`
  bg-gray-100
  rounded-md
  py-1.5
  cursor-not-allowed
  px-3
  text-gray-400
  font-bold
  shadow-sm
  hover:bg-gray-100
  active:ring-2
`;

export const SecondaryButton = tw.button`
  bg-gray-200
  rounded-md
  py-1.5
  px-3
  text-gray-600
  font-bold
  shadow-sm
  hover:bg-gray-300
  active:ring-2
`;

export const RedButton = styled(Button)`
  background: #f44336;

  &:hover {
    background: #e31000;
  }
`

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
`

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
`
