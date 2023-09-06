import NumberFormat from 'react-number-format';
import { TextField } from './text-field';

export const EuroField = ({
  name,
  value,
  onChange,
  plain = false,
  ...props
}) => (
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
