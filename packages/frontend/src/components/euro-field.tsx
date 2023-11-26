import { ComponentProps, InputHTMLAttributes } from 'react';
import NumberFormat, { NumberFormatProps } from 'react-number-format';
import { TextField } from '@bbat/ui/text-field';

export type Props = (NumberFormatProps<InputHTMLAttributes<HTMLInputElement>> & {
  plain: true;
  onChange: (evt: { target: { name: string; value: number } }) => void;
}) | (NumberFormatProps<ComponentProps<typeof TextField>> & {
  plain?: false | undefined;
  onChange: (evt: { target: { name: string; value: number } }) => void;
});

export const EuroField = ({
  name,
  value,
  onChange,
  plain = false,
  ...props
}: Props) => (
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
    customInput={plain ? undefined : TextField}
    style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
    name={name}
    {...props}
  />
);
