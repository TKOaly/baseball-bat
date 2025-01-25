import { expect } from '@playwright/test';
import { E2ETestEnvironment, test } from './fixtures';
import { euro, formatEuro } from '@bbat/common/currency';
import { createPayment } from '@/modules/payments/definitions';
import { groupBy } from 'fp-ts/lib/ReadonlyNonEmptyArray';
import { pipe } from 'fp-ts/lib/function';

const GROUPED_IBAN = 'FI79 9359 4446 8357 68';
const IBAN = GROUPED_IBAN.replaceAll(' ', '');

const createBankAccount = async (bbat: E2ETestEnvironment) => {
  const page = bbat.page;

  await page.goto(`${bbat.url}/admin/banking`);

  await page.getByRole('button', { name: 'Add bank account' }).click();

  await page.getByPlaceholder('Name').fill('Test Account');
  await page.getByPlaceholder('IBAN').fill(GROUPED_IBAN);
  await page.getByRole('button', { name: 'Create' }).click();
};

test('bank account creation', async ({ page, bbat }) => {
  await page.goto(bbat.url);

  await page
    .context()
    .addCookies([{ name: 'token', value: 'TEST-TOKEN', url: bbat.url }]);

  await bbat.login({});

  await createBankAccount(bbat);

  await expect(bbat.getResourceField('Name')).toHaveText('Test Account');
  await expect(bbat.getResourceField('IBAN')).toHaveText(IBAN);

  const table1 = bbat.table(
    bbat.getResourceSection('Statements').getByRole('table'),
  );
  await expect(table1.rows()).toHaveCount(0);

  const table2 = bbat.table(
    bbat.getResourceSection('Transactions').getByRole('table'),
  );
  await expect(table2.rows()).toHaveCount(0);
});

test('uploading bank statement', async ({ page, bbat }) => {
  await page.goto(bbat.url);

  await page
    .context()
    .addCookies([{ name: 'token', value: 'TEST-TOKEN', url: bbat.url }]);

  await bbat.login({});

  await createBankAccount(bbat);

  await page.getByRole('button', { name: 'Import bank statement' }).click();

  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Select file' }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles([
    {
      name: 'statement.xml',
      mimeType: 'application/xml',
      buffer: Buffer.from(
        await bbat.readFixture('camt/single-payment.xml'),
        'utf-8',
      ),
    },
  ]);

  const getByHeader = (header: string) =>
    page
      .getByRole('row')
      .filter({ has: page.getByText(header) })
      .getByRole('cell')
      .nth(1);

  await expect(getByHeader('Account')).toHaveText(IBAN);
  await expect(getByHeader('Transactions')).toHaveText('1');
  await expect(getByHeader('Debit')).toHaveText(formatEuro(euro(0)));
  await expect(getByHeader('Credit')).toHaveText(formatEuro(euro(10)));
  await expect(getByHeader('Opening balance')).toHaveText(formatEuro(euro(0)));
  await expect(getByHeader('Closing balance')).toHaveText(
    `${formatEuro(euro(10))} (${formatEuro(euro(10))})`,
  );
  await expect(getByHeader('Bank')).toHaveText(
    'Holvi Payment Services Oy (HOLVFIHH)',
  );
  await expect(getByHeader('Period')).toHaveText('01.01.2024 – 31.01.2024');
  await expect(page.getByText('Not found!')).not.toBeVisible();

  await page.getByRole('button', { name: 'Submit' }).click();
  await page.getByRole('button', { name: 'View statement' }).click();

  await expect(bbat.getResourceField('Account IBAN')).toHaveText(IBAN);
  await expect(bbat.getResourceField('Start Date')).toHaveText('01.01.2024');
  await expect(bbat.getResourceField('End Date')).toHaveText('31.01.2024');
  await expect(bbat.getResourceField('Opening Balance')).toHaveText(
    formatEuro(euro(0)),
  );
  await expect(bbat.getResourceField('Closing Balance')).toHaveText(
    formatEuro(euro(10)),
  );
  await expect(bbat.getResourceField('Account')).toHaveText('Test Account');

  const table = bbat.table(page.getByRole('table'));
  await expect(table.rows()).toHaveCount(1);
  const row = table.row(0);

  await expect(row.getCell('Type')).toHaveText('Credit');
  await expect(row.getCell('Date')).toHaveText('02.01.2024');
  await expect(row.getCell('Other Party')).toHaveText('TEPPO TESTAAJA');
  await expect(row.getCell('Reference')).toHaveText('RF4974154318938921639933');
  await expect(row.getCell('Message')).toHaveText('');
  await expect(row.getCell('Payment')).toHaveText('');
});

test('automatic payment registration', async ({ page, bbat }) => {
  const reference = 'RF4974154318938921639933';

  const payment = await bbat.withContext(async ctx => {
    return ctx.exec(createPayment, {
      payment: {
        type: 'invoice',
        amount: euro(10),
        data: {},
        title: 'Test Payment',
        message: 'Test Message',
      },
      options: {
        referenceNumber: reference,
      },
    });
  });

  await page.goto(bbat.url);

  await page
    .context()
    .addCookies([{ name: 'token', value: 'TEST-TOKEN', url: bbat.url }]);

  await bbat.login({});

  await createBankAccount(bbat);

  await page.getByRole('button', { name: 'Import bank statement' }).click();

  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Select file' }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles([
    {
      name: 'statement.xml',
      mimeType: 'application/xml',
      buffer: Buffer.from(
        await bbat.readFixture('camt/single-payment.xml'),
        'utf-8',
      ),
    },
  ]);

  await page.getByRole('button', { name: 'Submit' }).click();
  await page.getByRole('button', { name: 'View statement' }).click();

  await page.pause();

  const table = bbat.table(
    bbat.getResourceSection('Transactions').getByRole('table'),
  );
  await expect(table.rows()).toHaveCount(1);
  const row = table.row(0);
  await expect(row.getCell('Payment')).toHaveText(payment.paymentNumber);
});

test.describe('manual registration', () => {
  type TestParams = [number[], [number, number, number][], boolean, string];

  // prettier-ignore
  const params: TestParams[] = [
    [[10    ], [[1, 0, 10]            ],  true, '1 payment, 1 transaction, exact amount'],
    [[10    ], [[0, 0, 10]            ], false, '1 payment, 1 transaction, transaction amount surpassed'],
    [[ 5    ], [[1, 0, 10]            ],  true, '1 payment, 1 transaction, payment amount surpassed'],
    [[10    ], [[1, 0,  5], [0, 0,  5]],  true, '1 payment, 2 transactions, exact amount'],
    [[10    ], [[1, 0,  6], [0, 0,  5]],  true, '1 payment, 2 transactions, payment amount surpassed'],
    [[10    ], [[1, 0,  4], [0, 0,  6]], false, '1 payment, 2 transactions, transaction amount surpassed'],
    [[ 5,  5], [[1, 0,  5], [1, 1,  5]],  true, '2 payments, 1 transactions, exact amount'],
    [[ 5, 10], [[1, 0,  5], [1, 1,  6]], false, '2 payments, 1 transactions, transaction amount surpassed'],
    [[ 5, 10], [[1, 0,  5], [1, 1,  6]], false, '2 payments, 2 transactions, transaction amount surpassed'],
  ];

  for (const [paymentAmounts, registrations, shouldSucceed, name] of params) {
    test(`${name}${shouldSucceed ? '' : ' (fail)'}`, async ({ page, bbat }) => {
      const payments = await bbat.withContext(async ctx => {
        return Promise.all(
          paymentAmounts.map((amount, i) =>
            ctx.exec(createPayment, {
              payment: {
                type: 'invoice',
                amount: euro(amount),
                data: {},
                title: `Test Payment #${i}`,
                message: `Test Message #${i}`,
              },
            }),
          ),
        );
      });

      await page.goto(bbat.url);

      await page
        .context()
        .addCookies([{ name: 'token', value: 'TEST-TOKEN', url: bbat.url }]);

      await bbat.login({});

      await createBankAccount(bbat);

      await page.getByRole('button', { name: 'Import bank statement' }).click();

      const fileChooserPromise = page.waitForEvent('filechooser');
      await page.getByRole('button', { name: 'Select file' }).click();
      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles([
        {
          name: 'statement.xml',
          mimeType: 'application/xml',
          buffer: Buffer.from(
            await bbat.readFixture('camt/two-payments.xml'),
            'utf-8',
          ),
        },
      ]);

      await page.getByRole('button', { name: 'Submit' }).click();
      await page.getByRole('button', { name: 'View statement' }).click();

      const table = bbat.table(
        bbat.getResourceSection('Transactions').getByRole('table'),
      );

      await expect(table.rows()).toHaveCount(2);

      for (const [transactionIndex, paymentIndex, amount] of registrations) {
        await table.row(transactionIndex).action('Register');
        const dialog = bbat.getDialog('Register transaction');

        await expect(dialog.getByRole('table')).toBeVisible();
        const table2 = bbat.table(dialog.getByRole('table'));

        await dialog.getByRole('button', { name: 'Add row' }).click();
        const last = await table2.rowCount();

        await table2
          .row(last - 1)
          .getCell('Amount')
          .locator('input')
          .fill(`${amount}`);
        await table2
          .row(last - 1)
          .getCell('Payment')
          .getByText(/Select a payment/)
          .click();

        const dialog2 = bbat.getDialog('Select a payment');

        await dialog2
          .getByPlaceholder('Search...')
          .fill(payments[paymentIndex].humanId);
        await dialog2.getByText(payments[paymentIndex].title).click();

        const registerButton = dialog.getByRole('button', { name: 'Register' });
        await expect(registerButton).toBeVisible();

        if (shouldSucceed) {
          await expect(registerButton).not.toBeDisabled();
        } else {
          const disabled = await registerButton.isDisabled();

          if (disabled) {
            return;
          }
        }

        await registerButton.click();
      }

      const grouped = pipe(
        registrations,
        groupBy(r => r[0].toString()),
      );

      for (const [txi, pis] of Object.entries(grouped)) {
        const cell = table.row(parseInt(txi)).getCell('Payment');

        if (pis.length === 1) {
          await expect(cell).toHaveText(payments[pis[0][1]].paymentNumber);
        } else {
          await expect(cell).toHaveText(`${pis.length} payments`);
        }
      }

      if (!shouldSucceed) {
        throw new Error('Test was expected to fail!');
      }
    });
  }

  test('registration removal', async ({ page, bbat }) => {
    const payment = await bbat.withContext(async ctx => {
      return ctx.exec(createPayment, {
        payment: {
          type: 'invoice',
          amount: euro(10),
          data: {},
          title: `Test Payment`,
          message: `Test Message`,
        },
        options: {
          referenceNumber: 'RF4974154318938921639933',
        },
      });
    });

    await page.goto(bbat.url);

    await page
      .context()
      .addCookies([{ name: 'token', value: 'TEST-TOKEN', url: bbat.url }]);

    await bbat.login({});

    await createBankAccount(bbat);

    await page.getByRole('button', { name: 'Import bank statement' }).click();

    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Select file' }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles([
      {
        name: 'statement.xml',
        mimeType: 'application/xml',
        buffer: Buffer.from(
          await bbat.readFixture('camt/single-payment.xml'),
          'utf-8',
        ),
      },
    ]);

    await page.getByRole('button', { name: 'Submit' }).click();
    await page.getByRole('button', { name: 'View statement' }).click();

    const table = bbat.table(
      bbat.getResourceSection('Transactions').getByRole('table'),
    );

    await expect(table.rows()).toHaveCount(1);
    await expect(table.row(0).getCell('Payment')).toHaveText(
      payment.paymentNumber,
    );
    await table
      .row(0)
      .getCell('Payment')
      .getByText(payment.paymentNumber)
      .click();
    await expect(
      page.getByText(`Payment of ${formatEuro(euro(10))}`),
    ).toBeVisible();
    await expect(bbat.getResourceField('Status')).toHaveText('Paid');
    const paymentPage = page.url();
    await page.goBack();
    await table.row(0).action('Register');
    const dialog = bbat.getDialog('Register transaction');
    await dialog.getByRole('button', { name: 'Remove' }).click();
    await dialog.getByRole('button', { name: 'Register' }).click();
    await expect(table.row(0).getCell('Payment')).toHaveText('');
    await page.goto(paymentPage);
    await expect(bbat.getResourceField('Status')).toHaveText('Unpaid');
    await expect(
      page.getByText(`Payment of ${formatEuro(euro(10))}`),
    ).not.toBeVisible();
  });

  test('updating registration amount', async ({ page, bbat }) => {
    const payment = await bbat.withContext(async ctx => {
      return ctx.exec(createPayment, {
        payment: {
          type: 'invoice',
          amount: euro(10),
          data: {},
          title: `Test Payment`,
          message: `Test Message`,
        },
        options: {
          referenceNumber: 'RF4974154318938921639933',
        },
      });
    });

    await page.goto(bbat.url);

    await page
      .context()
      .addCookies([{ name: 'token', value: 'TEST-TOKEN', url: bbat.url }]);

    await bbat.login({});

    await createBankAccount(bbat);

    await page.getByRole('button', { name: 'Import bank statement' }).click();

    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Select file' }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles([
      {
        name: 'statement.xml',
        mimeType: 'application/xml',
        buffer: Buffer.from(
          await bbat.readFixture('camt/single-payment.xml'),
          'utf-8',
        ),
      },
    ]);

    await page.getByRole('button', { name: 'Submit' }).click();
    await page.getByRole('button', { name: 'View statement' }).click();

    const table = bbat.table(
      bbat.getResourceSection('Transactions').getByRole('table'),
    );

    await expect(table.rows()).toHaveCount(1);
    await expect(table.row(0).getCell('Payment')).toHaveText(
      payment.paymentNumber,
    );
    await table
      .row(0)
      .getCell('Payment')
      .getByText(payment.paymentNumber)
      .click();
    await expect(
      page.getByText(`Payment of ${formatEuro(euro(10))}`),
    ).toBeVisible();
    await expect(bbat.getResourceField('Status')).toHaveText('Paid');
    const paymentPage = page.url();
    await page.goBack();
    await table.row(0).action('Register');
    const dialog = bbat.getDialog('Register transaction');
    await dialog.locator('input').fill('5');
    await dialog.getByRole('button', { name: 'Register' }).click();
    await expect(table.row(0).getCell('Payment')).toHaveText(
      payment.paymentNumber,
    );
    await page.goto(paymentPage);
    await expect(bbat.getResourceField('Status')).toHaveText('Unpaid');
    await expect(
      page.getByText(`Payment of ${formatEuro(euro(5))}`),
    ).toBeVisible();
  });
});
