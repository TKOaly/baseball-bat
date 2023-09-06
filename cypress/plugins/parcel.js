import { Parcel } from '@parcel/core';

export const setupParcel = options => {
  let bundler = new Parcel({
    entries: ['cypress/compnent/***/*.cy.tsx'],
  });

  return bundler.watch();
};
