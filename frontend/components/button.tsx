import styled from 'styled-components'
import { Link } from 'wouter'

export const Button = styled.button`
  background: #22bd44;
  border-radius: 5px;
  color: #ffffff;
  font-size: 1.2rem;
  font-weight: bold;
  border: none;
  width: 80%;
  height: 40px;
  margin: 10px 0;
  transition: all 0.2s ease-in-out;
  cursor: pointer;

  &:hover {
    background: #159f33;
  }
`

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
