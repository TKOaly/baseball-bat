import styled, { keyframes } from 'styled-components'

const rotate = keyframes`
  0% {
    transform: rotate(0deg);
  }

  100% {
    transform: rotate(360deg);
  }
`

export const Loading = styled.div`
  width: 40px;
  height: 40px;
  background: #22bd44;
  animation: ${rotate} 1s linear infinite;
`
