import { createSlice } from '@reduxjs/toolkit';

type AccountingPeriodState = {
  activePeriod: number | null,
};

const initialState: AccountingPeriodState = {
  activePeriod: null,
};

const accountingPeriodSlice = createSlice({
  name: 'accountinPeriod',
  initialState,
  reducers: {
    setActiveAccountingPeriod: (state, action) => {
      state.activePeriod = action.payload.period;
    },

    bootstrap: (state, action) => {
      const sorted = [...action.payload]
        .filter((period) => !period.closed)
        .sort((a, b) => b.year - a.year);

      state.activePeriod = sorted[0].year;
    },
  },
});

export default accountingPeriodSlice;
