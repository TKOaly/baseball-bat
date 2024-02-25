import { expect } from '@playwright/test';
import { E2ETestEnvironment, test } from './fixtures';
import { euro, formatEuro } from '@bbat/common/currency';

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
