import styled from 'styled-components'

export const SmallContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #ffffff;
  box-shadow: 1px 1px 10px rgba(0, 0, 0, 0.25);
  border-radius: 10px;
  width: 30%;
  min-height: 20%;
`

export const LargeContainer = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  background: #ffffff;
  box-shadow: 1px 1px 10px rgba(0, 0, 0, 0.25);
  border-radius: 10px;
  width: 70%;
  min-height: 20%;
  max-height: 60%;
`
