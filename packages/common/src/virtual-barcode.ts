import FinnishBankUtils from 'finnish-bank-utils';
import { createCanvas } from 'canvas';
import JsBarcode from 'jsbarcode';
import format from 'date-fns/format';

export const formatBarcode = (
  iban: string,
  sum: number,
  reference: string,
  date: Date,
) => {
  const dateString = format(date, 'd.M.yyyy');

  return FinnishBankUtils.formatFinnishVirtualBarCode({
    iban,
    sum,
    reference,
    date: dateString,
  });
};

export const generateBarcodeImage = (barcode: string) => {
  const canvas = createCanvas(700, 140);
  JsBarcode(canvas, barcode, {
    displayValue: false,
  });
  return canvas.toDataURL('image/png');
};
