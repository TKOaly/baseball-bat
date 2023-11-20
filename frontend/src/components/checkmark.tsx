import styled, { keyframes } from 'styled-components';

const animation = keyframes`
  to {
    stroke-dashoffset: 0;
  }
`;

const CheckmarkSvg = styled.svg`
  stroke-dasharray: 1000;
  stroke-dashoffset: 1000;
  pointer-events: none;
  color: red;
  height: 50px;

  &#checkbox {
    animation: ${animation} 2s linear forwards infinite;
  }
`;

export const Checkmark = () => (
  <CheckmarkSvg
    xmlns="http://www.w3.org/2000/svg"
    width="50"
    height="50"
    viewBox="0 0 50 50"
    id="checkbox"
  >
    <path
      strokeLinecap="round"
      d="M20.285 2l-11.285 11.567-5.286-5.011-3.714 3.716 9 8.728 15-15.285z"
    />
  </CheckmarkSvg>
);
