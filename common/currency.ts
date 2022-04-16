export type EuroValue = {
  currency: 'eur'
  value: number
}

export const euro = (value: number): EuroValue => ({
  currency: 'eur',
  value: value * 100,
})

export const cents = (value: number): EuroValue => ({
  currency: 'eur',
  value,
})

export const sumEuroValues = (acc: undefined | EuroValue, value: EuroValue) => {
  if (acc === undefined) {
    return euro(0);
  } else {
    return { currency: 'eur', value: acc.value + value.value };
  }
}

export const formatEuro = (value: EuroValue) => {
  return new Intl.NumberFormat('fi', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value.value / 100)
}

