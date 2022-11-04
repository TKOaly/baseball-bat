import { createSlice } from '@reduxjs/toolkit';

type PaymentPoolState = {
  selectedPayments: Array<string>,
}

const initialState: PaymentPoolState = {
  selectedPayments: [],
};

const paymentPoolSlice = createSlice({
  name: 'paymentPool',
  initialState,
  reducers: {
    togglePaymentSelection: (state, action) => {
      const index = state.selectedPayments.indexOf(action.payload);

      if (index >= 0) {
        state.selectedPayments.splice(index, 1);
      } else {
        state.selectedPayments.push(action.payload);
      }
    },

    setSelectedPayments: (state, action) => {
      state.selectedPayments = action.payload;
    },
  },
});

export default paymentPoolSlice;
