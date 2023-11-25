import * as t from 'io-ts';

export const euroValue = t.type({
  currency: t.literal('eur'),
  value: t.number,
});

export type EuroValue = t.TypeOf<typeof euroValue>;

export const euro = (value: number): EuroValue => ({
  currency: 'eur',
  value: value * 100,
});

export const cents = (value: number): EuroValue => ({
  currency: 'eur',
  value,
});

export const eurosEqual = (a: EuroValue, b: EuroValue) => a.value === b.value;

export const makeEurosNegative = (value: EuroValue): EuroValue => ({
  ...value,
  value: -Math.abs(value.value),
});

export const compareEuroValues = (a: EuroValue, b: EuroValue): -1 | 0 | 1 => {
  if (a.value === b.value) {
    return 0;
  }

  if (a.value < b.value) {
    return -1;
  }

  return 1;
};

export const subEuroValues = (
  acc: undefined | EuroValue,
  value: EuroValue,
): EuroValue => {
  if (acc === undefined) {
    return euro(0);
  } else {
    return { currency: 'eur', value: acc.value - value.value };
  }
};

export const sumEuroValues = (
  acc: undefined | EuroValue,
  value: EuroValue,
): EuroValue => {
  if (acc === undefined) {
    return euro(0);
  } else {
    return { currency: 'eur', value: acc.value + value.value };
  }
};

export const formatEuro = (value: EuroValue) => {
  return new Intl.NumberFormat('fi', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value.value / 100);
};
