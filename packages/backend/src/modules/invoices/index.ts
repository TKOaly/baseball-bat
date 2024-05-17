import { BusContext } from '@/app';
import sql from 'sql-template-strings';
import {
  createPaymentEvent,
  getPayment,
  getPaymentsByData,
  onPaymentCreated,
  paymentTypeIface,
} from '../payments/definitions';
import * as t from 'io-ts';
import * as tt from 'io-ts-types';
import * as E from 'fp-ts/Either';
import { ExecutionContext } from '@/bus';
import { formatISO, isBefore, parseISO, subDays } from 'date-fns';
import { isLeft } from 'fp-ts/Either';
import {
  DbPaymentEventTransactionMapping,
  Payment,
  isPaymentInvoice,
} from '@bbat/common/types';
import { getDebtsByPayment } from '../debts/definitions';
import { euro, sumEuroValues } from '@bbat/common/currency';
import {
  getPayerPrimaryEmail,
  getPayerProfileByInternalIdentity,
} from '../payers/definitions';
import { createEmail } from '../email/definitions';
import {
  getTransactionsByReference,
  onTransaction,
} from '../banking/definitions';
import { createModule } from '@/module';

function normalizeReferenceNumber(reference: string) {
  return reference
    .replace(/^0+/, '')
    .replace(/[^A-Z0-9]/gi, '')
    .replace(/^(RF[0-9]{2})0+/, '$1')
    .toUpperCase();
}

function finnishReferenceChecksum(num: bigint): bigint {
  const factors = [7n, 3n, 1n];
  let acc = 0n;

  for (let i = 0; num > 10n ** BigInt(i); i++) {
    const digit = (num / 10n ** BigInt(i)) % 10n;
    acc += digit * factors[i % 3];
  }

  return (10n - (acc % 10n)) % 10n;
}

function createReferenceNumber(series: number, year: number, number: number) {
  const finRef =
    1337n * 10n ** 11n +
    BigInt(year) * 10n ** 7n +
    BigInt(number) * 10n ** 3n +
    BigInt(series);
  const finCheck = finnishReferenceChecksum(finRef);
  const content = finRef * 10n + finCheck;
  const tmp = content * 10n ** 6n + 271500n;
  const checksum = 98n - (tmp % 97n);
  const numbers: Record<string, string> = { Y: `${checksum}`, X: `${content}` };
  const template = 'RFYYXXXXXXXXXXXXXXXX';
  const acc = new Array(template.length);

  for (let i = template.length - 1; i >= 0; i--) {
    const letter = template[i];

    if (letter in numbers) {
      const number = numbers[letter];
      const digit = number[number.length - 1];
      acc[i] = digit ?? '0';
      numbers[letter] = number.substring(0, number.length - 1);
    } else {
      acc[i] = letter;
    }
  }

  return acc.map(i => `${i}`).join('');
}

const invoiceOptions = t.partial({
  referenceNumber: t.string,
  series: t.Int,
  date: tt.date,
  dueDate: tt.date,
});

export default createModule({
  name: 'invoices',

  async setup({ bus, config }) {
    async function sendNewPaymentNotification(
      bus: ExecutionContext<BusContext>,
      payment: Payment,
    ) {
      const debts = await bus.exec(getDebtsByPayment, payment.id);

      if (debts.length === 0) {
        return E.left('Invoice has no debts associated with it!');
      }

      const payerId = debts[0].payerId;
      const total = debts
        .map(debt => debt.total)
        .reduce(sumEuroValues, euro(0));
      const payer = await bus.exec(getPayerProfileByInternalIdentity, payerId);
      const email = await bus.exec(getPayerPrimaryEmail, payerId);

      if (!email || !payer) {
        return E.left('Could not determine email for payer');
      }

      if (!isPaymentInvoice(payment)) {
        return E.left('Payment is not an invoice');
      }

      const created = await bus.exec(createEmail, {
        template: 'new-invoice',
        recipient: email.email,
        payload: {
          link: config.appUrl,
          title: payment.title,
          number: payment.paymentNumber,
          date: parseISO(payment.data.date),
          dueDate: payment.data.due_date
            ? parseISO(payment.data.due_date)
            : null,
          amount: total,
          debts,
          referenceNumber: payment.data.reference_number,
          message: payment.message,
          receiverName: payer.name,
        },
        debts: debts.map(debt => debt.id),
        subject: '[Lasku / Invoice] ' + payment.title,
      });

      return E.fromNullable('Could not create email')(created);
    }

    bus.provideNamed(paymentTypeIface, 'invoice', {
      async createPayment(params, _, bus) {
        const { paymentId } = params;

        const optionsResult = invoiceOptions.decode(params.options);

        if (isLeft(optionsResult)) {
          console.error('Invalid options: ', params.options);
          throw new Error('Invalid options!');
        }

        const options = optionsResult.right;

        const payment = await bus.exec(getPayment, paymentId);

        if (!payment) {
          throw new Error('No such payment exists!');
        }

        const data = {
          reference_number: options.referenceNumber
            ? normalizeReferenceNumber(options.referenceNumber)
            : createReferenceNumber(
                options.series ?? 0,
                payment.accountingPeriod,
                payment.humanIdNonce ?? 0,
              ),
          due_date: options.dueDate ? formatISO(options.dueDate) : null,
          date: formatISO(options.date ?? new Date()),
        };

        return data;
      },
    });

    bus.on(onTransaction, async (transaction, { pg }, bus) => {
      const [existing_mapping] =
        await pg.many<DbPaymentEventTransactionMapping>(sql`
            SELECT *
            FROM payment_event_transaction_mapping
            WHERE bank_transaction_id = ${transaction.id}
          `);

      if (existing_mapping) {
        return;
      }

      const [payment] = await bus.exec(getPaymentsByData, {
        reference_number: transaction.reference,
      });

      if (!payment) {
        return;
      }

      await bus.exec(createPaymentEvent, {
        paymentId: payment.id,
        type: 'payment',
        amount: transaction.amount,
        time: transaction.date,
        transaction: transaction.id,
        data: {},
      });
    });

    bus.on(onPaymentCreated, async ({ paymentId }, _, bus) => {
      const payment = await bus.exec(getPayment, paymentId);

      if (!payment) {
        throw new Error('No such payment!');
      }

      if (!isPaymentInvoice(payment)) {
        return;
      }

      const transactions = await bus.exec(
        getTransactionsByReference,
        payment.data.reference_number,
      );

      await Promise.all(
        transactions.map(transaction =>
          bus.exec(createPaymentEvent, {
            paymentId: payment.id,
            type: 'payment',
            amount: transaction.amount,
            time: transaction.date,
            transaction: transaction.id,
            data: {},
          }),
        ),
      );
    });

    bus.on(onPaymentCreated, async ({ paymentId }, _, bus) => {
      const payment = (await bus.exec(getPayment, paymentId))!; // eslint-disable-line

      if (!isPaymentInvoice(payment)) {
        return;
      }

      const isBackdated = isBefore(
        parseISO(payment.data.date),
        subDays(new Date(), 1),
      );

      if (isBackdated) {
        return;
      }

      await sendNewPaymentNotification(bus, payment);
    });
  },
});
