import { expect } from '@playwright/test';
import { test } from './fixtures';

const GROUPED_IBAN = 'FI79 9359 4446 8357 68';
const IBAN = GROUPED_IBAN.replaceAll(' ', '');

test('bank account creation', async ({ page, bbat }) => {
  await page.goto(bbat.url);

  await page
    .context()
    .addCookies([{ name: 'token', value: 'TEST-TOKEN', url: bbat.url }]);

  await bbat.login({});

  await page.goto(`${bbat.url}/admin/banking`);

  await page.getByRole('button', { name: 'Add bank account' }).click();

  await page.getByPlaceholder('Name').fill('Test Account');
  await page.getByPlaceholder('IBAN').fill(GROUPED_IBAN);
  await page.getByRole('button', { name: 'Create' }).click();

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
