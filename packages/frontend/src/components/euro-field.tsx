import { ComponentProps } from 'react';
import { NumericFormat, NumericFormatProps } from 'react-number-format';
import { TextField } from '@bbat/ui/text-field';

export type Props = Omit<
  NumericFormatProps<ComponentProps<typeof TextField>>,
  'onChange'
> & {
  onChange: (evt: {
    target: { name?: string; value: number | undefined };
  }) => void;
};

export const EuroField = ({ name, value, onChange, ...props }: Props) => (
  <NumericFormat
    value={value}
    onValueChange={value => {
      onChange({
        target: { name, value: value.floatValue },
      });
    }}
    suffix=" €"
    decimalScale={2}
    fixedDecimalScale
    decimalSeparator=","
    thousandSeparator=" "
    customInput={TextField}
    style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
    name={name}
    {...props}
  />
);
