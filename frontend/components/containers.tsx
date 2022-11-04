import styled from 'styled-components';

export const SmallContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #ffffff;
  box-shadow: 1px 1px 10px rgba(0, 0, 0, 0.25);
  border-radius: 10px;
  width: 400px;
  min-height: 20%;
`;

export const LargeContainer = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  background: #ffffff;
  box-shadow: 1px 1px 10px rgba(0, 0, 0, 0.25);
  border-radius: 10px;
  width: 1200px;
  height: 800px;

  @media (max-width: 1200px) {
    width: 100%;
    flex-direction: column;
    height: 100%;
  }
`;
