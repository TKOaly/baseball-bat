import { expect } from '@playwright/test';
import { E2ETestEnvironment, test } from './fixtures';
import { getYear } from 'date-fns';

type DebtCreationOptions = {
  name: string;
  center: string | { create: true; name: string };
  payer: string | { create: true; name: string; email: string };
  components: { name: string; amount: number }[];
};

const createDebt = async (
  bbat: E2ETestEnvironment,
  debt: DebtCreationOptions,
) => {
  const { page } = bbat;

  const centerName =
    typeof debt.center === 'string' ? debt.center : debt.center.name;
  const createCenter = typeof debt.center === 'object' && debt.center.create;

  const payerName =
    typeof debt.payer === 'string' ? debt.payer : debt.payer.name;
  const payerEmail = typeof debt.payer === 'object' ? debt.payer.email : null;
  const createPayer = typeof debt.payer === 'object' && debt.payer.create;

  await page.goto(`${bbat.url}/admin/debts/create`);
  await page.getByPlaceholder('Name').fill(debt.name);
  await page
    .getByText('Center')
    .locator('..')
    .locator('input')
    .fill(centerName);

  if (createCenter) {
    await page.getByText(`Create "${centerName}"`).click();
  }

  await page.getByText('Payer').locator('..').locator('input').fill(payerName);

  if (createPayer) {
    await page.getByText(`Create "${payerName}"`).click();
    await page.getByPlaceholder('Email address').fill(`${payerEmail}`);
    await page.locator('.dialog-base').getByText('Create').click();
  }

  let i = 0;
  for (const { name, amount } of debt.components) {
    await page.getByTestId('tabular-field-list-add-button').click();
    await page
      .locator(`[data-row="${i}"][data-column="component"] input`)
      .fill(name);
    await page.getByText(`Create "${name}"`).click();
    await page
      .locator(`[data-row="${i}"][data-column="amount"] input`)
      .fill(`${amount}`);
    i++;
  }
  await page.getByTestId('create-debt').click();
};

test('debt creation', async ({ page, bbat }) => {
  await page.goto(bbat.url);

  await page
    .context()
    .addCookies([{ name: 'token', value: 'TEST-TOKEN', url: bbat.url }]);

  await bbat.login({
    screenName: 'John Smith',
  });

  await createDebt(bbat, {
    name: 'Test Debt',
    payer: {
      create: true,
      name: 'Matti',
      email: 'matti@example.com',
    },
    center: {
      create: true,
      name: 'Test Center',
    },
    components: [
      {
        name: 'Test Component',
        amount: 10.0,
      },
    ],
  });

  await expect(bbat.getResourceField('published at')).toHaveText(
    'Not published',
  );
  await expect(bbat.getResourceField('payment condition')).toHaveText(
    '14 days',
  );
  await expect(bbat.getResourceField('name')).toHaveText('Test Debt');
  await expect(bbat.getResourceField('payer')).toHaveText('Matti');
  await expect(bbat.getResourceField('due date')).toBeHidden();
  await expect(bbat.getResourceField('status')).toHaveText('Draft');

  await page.getByTestId('side-navigation').getByText('Debts').click();
  const table = bbat.table(page.getByRole('table'));
  await expect(table.rows()).toHaveCount(1);
  const row = table.getRowByColumnValue('Name', 'Test Debt');
  expect(await row.index()).toEqual(0);
  await expect(row.getCell('Payer')).toHaveText('Matti');
  await expect(row.getCell('Identifier')).toHaveText(
    `DEBT-${getYear(new Date())}-0000`,
  );
  await expect(row.getCell('Status').getByText('Draft')).toBeVisible();
  await expect(row.getCell('Status').getByText('Unpaid')).toBeVisible();
  await expect(row.getCell('Components')).toHaveText('Test Component');
});
