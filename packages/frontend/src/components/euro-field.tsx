import { ComponentProps } from 'react';
import NumberFormat, { NumberFormatProps } from 'react-number-format';
import { TextField } from '@bbat/ui/text-field';

export type Props = Omit<
  NumberFormatProps<ComponentProps<typeof TextField>>,
  'onChange'
> & {
  onChange: (evt: {
    target: { name?: string; value: number | undefined };
  }) => void;
};

export const EuroField = ({ name, value, onChange, ...props }: Props) => (
  <NumberFormat
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
