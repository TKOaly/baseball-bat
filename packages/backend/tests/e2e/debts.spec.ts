import { expect } from '@playwright/test';
import { E2ETestEnvironment, test } from './fixtures';
import { addDays, format, getYear } from 'date-fns';
import assert from 'assert';
import { euro, formatEuro } from '@bbat/common/currency';

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

  await expect(page.getByRole('button', { name: 'Publish' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Publish' }),
  ).not.toBeDisabled();
  await expect(page.getByRole('button', { name: 'Delete' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete' })).not.toBeDisabled();
  await expect(page.getByRole('button', { name: 'Credit' })).not.toBeVisible();

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

test('debt deletion', async ({ page, bbat }) => {
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

  await page.getByTestId('side-navigation').getByText('Debts').click();
  const table = bbat.table(page.getByRole('table'));
  await expect(table.rows()).toHaveCount(1);
  const row = table.getRowByColumnValue('Name', 'Test Debt');
  await row.getCell('Identifier').click();
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByTestId('side-navigation').getByText('Debts').click();

  const table2 = bbat.table(page.getByRole('table'));
  await expect(table2.rows()).toHaveCount(0);
});

test('test publishing', async ({ page, bbat }) => {
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

  await page.getByRole('button', { name: 'Publish' }).click();

  await expect(bbat.getResourceField('Status')).toHaveText('Unpaid');
  await expect(bbat.getResourceField('Due Date')).toHaveText(
    format(addDays(new Date(), 14), 'dd.MM.yyyy'),
  );

  await expect(page.getByRole('button', { name: 'Publish' })).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete' })).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Credit' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Credit' })).not.toBeDisabled();

  const table = bbat.table(
    bbat.getResourceSection('Payments').getByRole('table'),
  );
  await expect(table.rows()).toHaveCount(1);
  const row = table.row(0);

  await expect(row.getCell('Name')).toHaveText('Test Debt');
  await expect(row.getCell('Status')).toHaveText('Unpaid');
  await expect(row.getCell('Number')).toHaveText(`${getYear(new Date())}-0000`);
  await expect(row.getCell('Total')).toHaveText('−10,00 €');

  const table2 = bbat.table(
    bbat.getResourceSection('Emails').getByRole('table'),
  );
  await expect(table2.rows()).toHaveCount(1);
  const row2 = table2.row(0);

  await expect(row2.getCell('Recipient')).toHaveText('matti@example.com');
  await expect(row2.getCell('Subject')).toHaveText(
    '[Lasku / Invoice] Test Debt',
  );
});

test.describe('CSV import', () => {
  test('simple with payment condition', async ({ page, bbat, context }) => {
    await page.goto(bbat.url);

    await page
      .context()
      .addCookies([{ name: 'token', value: 'TEST-TOKEN', url: bbat.url }]);

    await bbat.login({});

    await page.goto(`${bbat.url}/admin/debts`);

    await page.getByRole('button', { name: 'Mass Creation' }).click();

    const fileChooserPromise = page.waitForEvent('filechooser');

    await page
      .getByRole('button', { name: 'upload one by clicking here' })
      .click();

    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles([
      {
        name: 'import.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(
          await bbat.readFixture('csv/simple-payment-condition.csv'),
          'utf-8',
        ),
      },
    ]);

    await page.getByRole('button', { name: 'Interpret as headers' }).click();
    await page.getByRole('button', { name: 'Create Debts' }).click();

    await expect(page.getByText('Created Debt')).toBeVisible();

    const pagePromise = context.waitForEvent('page');
    await page.getByRole('button', { name: 'View created' }).click();

    const newPage = await pagePromise;

    const message = newPage.getByText(
      /Here are listed all debts associated with the tag "mass-import-batch-[a-z0-9]{11}"\./,
    );
    await expect(message).toBeVisible();
    const messageContent = await message.innerText();
    const match = messageContent.match(/mass-import-batch-[a-z0-9]{11}/);

    assert.ok(match);

    const tag = match[0];

    const tableLocator = newPage.getByRole('table');
    await expect(tableLocator).toHaveCount(1);
    const table = bbat.table(tableLocator);
    await expect(table.rows()).toHaveCount(1);
    const row = table.row(0);
    await expect(row.getCell('Identifier')).toHaveText(
      `DEBT-${getYear(new Date())}-0000`,
    );
    await expect(row.getCell('Name')).toHaveText('Test Debt');
    await expect(row.getCell('Payer')).toHaveText('Teppo Testaaja');
    await expect(row.getCell('Components')).toHaveText(/Osallistumismaksu/);
    await expect(row.getCell('Tags')).toHaveText(tag);

    await row.getCell('Identifier').click();

    const newBbat = new E2ETestEnvironment(newPage, bbat.url, bbat.env);

    await expect(newBbat.getResourceField('Payment Condition')).toHaveText(
      '14 days',
    );
    await expect(newBbat.getResourceField('Total')).toHaveText(
      formatEuro(euro(10)),
    );
    await expect(newBbat.getResourceField('Published at')).toHaveText(
      'Not published',
    );
  });

  test('simple with due date', async ({ page, bbat, context }) => {
    await page.goto(bbat.url);

    await page
      .context()
      .addCookies([{ name: 'token', value: 'TEST-TOKEN', url: bbat.url }]);

    await bbat.login({});

    await page.goto(`${bbat.url}/admin/debts`);

    await page.getByRole('button', { name: 'Mass Creation' }).click();

    const fileChooserPromise = page.waitForEvent('filechooser');

    await page
      .getByRole('button', { name: 'upload one by clicking here' })
      .click();

    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles([
      {
        name: 'import.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(
          await bbat.readFixture('csv/simple-due-date.csv'),
          'utf-8',
        ),
      },
    ]);

    await page.getByRole('button', { name: 'Interpret as headers' }).click();
    await page.getByRole('button', { name: 'Create Debts' }).click();

    await expect(page.getByText('Created Debt')).toBeVisible();

    const pagePromise = context.waitForEvent('page');
    await page.getByRole('button', { name: 'View created' }).click();

    const newPage = await pagePromise;

    const message = newPage.getByText(
      /Here are listed all debts associated with the tag "mass-import-batch-[a-z0-9]{11}"\./,
    );
    await expect(message).toBeVisible();
    const messageContent = await message.innerText();
    const match = messageContent.match(/mass-import-batch-[a-z0-9]{11}/);

    assert.ok(match);

    const tag = match[0];

    const tableLocator = newPage.getByRole('table');
    await expect(tableLocator).toHaveCount(1);
    const table = bbat.table(tableLocator);
    await expect(table.rows()).toHaveCount(1);
    const row = table.row(0);
    await expect(row.getCell('Identifier')).toHaveText(
      `DEBT-${getYear(new Date())}-0000`,
    );
    await expect(row.getCell('Name')).toHaveText('Test Debt');
    await expect(row.getCell('Payer')).toHaveText('Teppo Testaaja');
    await expect(row.getCell('Components')).toHaveText(/Osallistumismaksu/);
    await expect(row.getCell('Tags')).toHaveText(tag);

    await row.getCell('Identifier').click();

    const newBbat = new E2ETestEnvironment(newPage, bbat.url, bbat.env);

    await expect(newBbat.getResourceField('Due date')).toHaveText('12.03.2030');
    await expect(newBbat.getResourceField('Total')).toHaveText(
      formatEuro(euro(10)),
    );
    await expect(newBbat.getResourceField('Published at')).toHaveText(
      'Not published',
    );
  });

  test('with reference number', async ({ page, bbat, context }) => {
    await page.goto(bbat.url);

    await page
      .context()
      .addCookies([{ name: 'token', value: 'TEST-TOKEN', url: bbat.url }]);

    await bbat.login({});

    await page.goto(`${bbat.url}/admin/debts`);

    await page.getByRole('button', { name: 'Mass Creation' }).click();

    const fileChooserPromise = page.waitForEvent('filechooser');

    await page
      .getByRole('button', { name: 'upload one by clicking here' })
      .click();

    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles([
      {
        name: 'import.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(
          await bbat.readFixture('csv/with-reference-number.csv'),
          'utf-8',
        ),
      },
    ]);

    await page.getByRole('button', { name: 'Interpret as headers' }).click();

    await page.pause();

    await page.getByRole('button', { name: 'Create Debts' }).click();

    await expect(page.getByText('Created Debt')).toBeVisible();

    const pagePromise = context.waitForEvent('page');
    await page.getByRole('button', { name: 'View created' }).click();

    const newPage = await pagePromise;

    const message = newPage.getByText(
      /Here are listed all debts associated with the tag "mass-import-batch-[a-z0-9]{11}"\./,
    );
    await expect(message).toBeVisible();
    const messageContent = await message.innerText();
    const match = messageContent.match(/mass-import-batch-[a-z0-9]{11}/);

    assert.ok(match);

    const tag = match[0];

    const tableLocator = newPage.getByRole('table');
    await expect(tableLocator).toHaveCount(1);
    const table = bbat.table(tableLocator);
    await expect(table.rows()).toHaveCount(1);
    const row = table.row(0);
    await expect(row.getCell('Identifier')).toHaveText(
      `DEBT-${getYear(new Date())}-0000`,
    );
    await expect(row.getCell('Name')).toHaveText('Test Debt');
    await expect(row.getCell('Payer')).toHaveText('Teppo Testaaja');
    await expect(row.getCell('Components')).toHaveText(/Osallistumismaksu/);
    await expect(row.getCell('Tags')).toHaveText(tag);

    await row.getCell('Identifier').click();

    const newBbat = new E2ETestEnvironment(newPage, bbat.url, bbat.env);

    await expect(newBbat.getResourceField('Payment condition')).toHaveText(
      '14 days',
    );
    await expect(newBbat.getResourceField('Total')).toHaveText(
      formatEuro(euro(10)),
    );
    await expect(newBbat.getResourceField('Published at')).toHaveText(
      'Not published',
    );

    await newPage.getByRole('button', { name: 'Publish' }).click();

    const paymentsTable = newBbat.table(
      newBbat.getResourceSection('Payments').getByRole('table'),
    );
    await expect(paymentsTable.rows()).toHaveCount(1);
    await paymentsTable.row(0).getCell('Name').click();
    await expect(newBbat.getResourceField('Reference number')).toHaveText(
      'RF4974154318938921639933',
    );
  });
});
