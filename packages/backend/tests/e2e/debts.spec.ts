import { Page, expect } from '@playwright/test';
import { E2ETestEnvironment, test } from './fixtures';
import { addDays, format, getYear, subDays } from 'date-fns';
import assert from 'assert';
import { cents, euro, formatEuro } from '@bbat/common/currency';
import {
  Event,
  Registration,
  CustomField,
  tkoalyIdentity,
  UpstreamUser,
} from '@bbat/common/types';
import {
  getEventCustomFields,
  getEventRegistrations,
  getEvents,
} from '@/modules/events/definitions';
import {
  getUpstreamUserByEmail,
  getUpstreamUserById,
  getUpstreamUsers,
} from '@/modules/users/definitions';

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

const navigate = async (page: Page, item: string) => {
  const visible = await page.getByTestId('side-navigation-open').isVisible();

  if (visible) {
    await page.getByTestId('side-navigation-open').click();
  }

  await page.getByTestId('side-navigation').getByText(item).click();

  if (visible) {
    await page.getByTestId('side-navigation-close').click();
  }
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

  await navigate(page, 'Debts');
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

  await navigate(page, 'Debts');
  const table = bbat.table(page.getByRole('table'));
  await expect(table.rows()).toHaveCount(1);
  const row = table.getRowByColumnValue('Name', 'Test Debt');
  await row.getCell('Identifier').click();
  await page.getByRole('button', { name: 'Delete' }).click();
  await navigate(page, 'Debts');

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
  await expect(bbat.getResourceField('Published at')).toHaveText(
    /[0-9]{2}.[0-9]{2}.[0-9]{4} [0-9]{2}:[0-9]{2} by John Smith/,
  );
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
  await expect(row.getCell('Balance')).toHaveText(formatEuro(euro(-10)));

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

    const newBbat = bbat.newPage(newPage);

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

    const newBbat = bbat.newPage(newPage);

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

    const newBbat = bbat.newPage(newPage);

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

  test('with multiple default components', async ({ page, bbat, context }) => {
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
          await bbat.readFixture('csv/multiple-with-default-component.csv'),
          'utf-8',
        ),
      },
    ]);

    await page.getByRole('button', { name: 'Interpret as headers' }).click();

    await page.getByText('No type').nth(0).click();
    await page.getByRole('menuitem', { name: 'Custom component...' }).click();

    const dialog = bbat.getDialog();
    await dialog.getByPlaceholder('Component name').fill('Discount');
    await dialog.getByLabel('Amount').fill('2');
    await dialog.getByRole('button', { name: 'Create' }).click();

    await page.getByText('No type').nth(0).click();
    await page.getByRole('menuitem', { name: 'Custom component...' }).click();

    await dialog.getByPlaceholder('Component name').fill('Surcharge');
    await dialog.getByLabel('Amount').fill('10');
    await dialog.getByRole('button', { name: 'Create' }).click();

    await page.getByRole('button', { name: 'Create Debts' }).click();

    await expect(page.locator('[data-loading="true"]')).toHaveCount(3);
    await expect(page.locator('[data-loading="true"]')).toHaveCount(0, {
      timeout: 10000,
    });

    const pagePromise = context.waitForEvent('page');
    await page.getByRole('button', { name: 'View created' }).click();

    const newPage = await pagePromise;
    const newBbat = bbat.newPage(newPage);

    const message = newPage.getByText(
      /Here are listed all debts associated with the tag "mass-import-batch-[a-z0-9]{11}"\./,
    );
    await expect(message).toBeVisible();
    const messageContent = await message.innerText();
    const match = messageContent.match(/mass-import-batch-[a-z0-9]{11}/);

    assert.ok(match);

    const tableLocator = newPage.getByRole('table');
    await expect(tableLocator).toHaveCount(1);
    const table = bbat.table(tableLocator);
    await expect(table.rows()).toHaveCount(3);

    const row1 = table.getRowByColumnValue('Name', 'Test Debt #1');
    await expect(row1.getCell('Amount')).toHaveText(formatEuro(euro(2)));
    await expect(row1.getCell('Components')).toHaveText(/Discount/);

    const row2 = table.getRowByColumnValue('Name', 'Test Debt #2');
    await expect(row2.getCell('Amount')).toHaveText(formatEuro(euro(12)));
    await expect(row2.getCell('Components')).toHaveText(/Discount/);
    await expect(row2.getCell('Components')).toHaveText(/Surcharge/);

    const row3 = table.getRowByColumnValue('Name', 'Test Debt #3');
    await expect(row3.getCell('Amount')).toHaveText(formatEuro(euro(10)));
    await expect(row3.getCell('Components')).toHaveText(/Surcharge/);

    await row2.getCell('Identifier').click();
    await newBbat.getResourceField('Collection').getByRole('link').click();

    const debts = newBbat.table(
      newBbat.getResourceSection('Debts').getByRole('table'),
    );
    await expect(debts.rows()).toHaveCount(3);

    const components = newBbat.table(
      newBbat.getResourceSection('Debt Components').getByRole('table'),
    );
    await expect(components.rows()).toHaveCount(2);
  });

  test('simple with decimals', async ({ page, bbat, context }) => {
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
          await bbat.readFixture('csv/simple-with-decimals.csv'),
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

    const newBbat = bbat.newPage(newPage);

    await expect(newBbat.getResourceField('Payment Condition')).toHaveText(
      '14 days',
    );
    await expect(newBbat.getResourceField('Total')).toHaveText(
      formatEuro(cents(1050)),
    );
    await expect(newBbat.getResourceField('Published at')).toHaveText(
      'Not published',
    );
  });
});

test.describe('calendar import', () => {
  type MockEvent = Partial<
    Event & { registrations: Partial<Registration>[]; fields: CustomField[] }
  >;

  const mockEventDetails = (bbat: E2ETestEnvironment, events: MockEvent[]) => {
    const users: UpstreamUser[] = [];

    const resolvedEvents: Event[] = events.map(
      ({ fields: _, registrations, ...event }, id) => ({
        id,
        deleted: false,
        name: 'Test Event',
        starts: subDays(new Date(), 2),
        registrationStarts: subDays(new Date(), 10),
        registrationEnds: subDays(new Date(), 5),
        cancellationStarts: subDays(new Date(), 10),
        cancellationEnds: subDays(new Date(), 5),
        maxParticipants: 10,
        registrationCount: registrations?.length ?? 0,
        location: 'Test Runner Internals',
        price: cents(1337),
        ...event,
      }),
    );

    const registrations: Registration[][] = events.map(
      ({ registrations }, ei) =>
        (registrations ?? []).map((r, ri) => {
          const user = {
            id: tkoalyIdentity(users.length),
            screenName: r.name ?? 'Olli Osallistuja',
            email: r.email ?? 'olli@osallistuja.org',
            username: r.name ?? 'oltsu1234',
            role: 'kayttaja' as const,
          };

          users.push(user);

          return {
            id: ei * 1000 + ri,
            userId: user.id,
            name: user.screenName,
            email: user.email,
            phone: '+358 40 1234567',
            answers: [],
            ...r,
          };
        }),
    );

    bbat.mockProcedure(getEvents, async () => resolvedEvents);
    bbat.mockProcedure(
      getEventRegistrations,
      async id => registrations[id] ?? [],
    );
    bbat.mockProcedure(
      getEventCustomFields,
      async id => events[id]?.fields ?? [],
    );

    bbat.mockProcedure(
      getUpstreamUserByEmail,
      async ({ email }) => users.find(u => u.email === email) ?? null,
    );
    bbat.mockProcedure(
      getUpstreamUserById,
      async ({ id }) => users.find(u => u.id.value === id.value) ?? null,
    );
    bbat.mockProcedure(getUpstreamUsers, async () => users);
  };

  test('case: single event, no queue, no questions', async ({ bbat, page }) => {
    mockEventDetails(bbat, [
      {
        registrations: [
          { name: 'Olli Osallistuja' },
          { name: 'Ilmari Ilmoittautuja' },
        ],
      },
    ]);

    await page.goto(bbat.url);
    await bbat.login({});
    await page.goto(`${bbat.url}/admin/debt-centers/create-from-event`);

    await page.getByRole('button', { name: 'Test Event' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByPlaceholder('Name').fill('Test Event');
    await page.getByRole('button', { name: 'Continue' }).click();

    const participants = bbat.table(page.getByRole('table').nth(0));

    await expect(participants.rows()).toHaveCount(2);

    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page.getByText(/with a total value of/)).toBeVisible();

    const summary = bbat.table(page.getByRole('table').nth(0));
    await expect(summary.rows()).toHaveCount(1);
    const row = summary.row(0);
    await expect(row.getCell('Count')).toHaveText('2');
    await expect(row.getCell('Price')).toHaveText(formatEuro(cents(1337)));
    await expect(row.getCell('Total')).toHaveText(formatEuro(cents(1337 * 2)));
    await page.getByRole('button', { name: 'Create debts' }).click();

    await page.waitForURL(
      url =>
        !!url.pathname.match(
          /\/admin\/debt-centers\/[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}/,
        ),
    );

    const debtsTable = bbat.table(
      bbat.getResourceSection('Debts').getByRole('table'),
    );
    await expect(debtsTable.rows()).toHaveCount(2);

    const olliRow = debtsTable.getRowByColumnValue('Payer', 'Olli Osallistuja');
    await expect(olliRow.getCell('Amount')).toHaveText(formatEuro(cents(1337)));

    const ilmariRow = debtsTable.getRowByColumnValue(
      'Payer',
      'Ilmari Ilmoittautuja',
    );
    await expect(ilmariRow.getCell('Amount')).toHaveText(
      formatEuro(cents(1337)),
    );
  });

  test('case: single event, queue, no questions', async ({ bbat, page }) => {
    mockEventDetails(bbat, [
      {
        registrations: [
          { name: 'Olli Osallistuja' },
          { name: 'Ilmari Ilmoittautuja' },
        ],
        maxParticipants: 1,
      },
    ]);

    await page.goto(bbat.url);
    await bbat.login({});
    await page.goto(`${bbat.url}/admin/debt-centers/create-from-event`);

    await page.getByRole('button', { name: 'Test Event' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByPlaceholder('Name').fill('Test Event');
    await page.getByRole('button', { name: 'Continue' }).click();

    const participants = bbat.table(page.getByRole('table').nth(0));
    const queue = bbat.table(page.getByRole('table').nth(1));

    await expect(participants.rows()).toHaveCount(1);
    await expect(queue.rows()).toHaveCount(1);

    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page.getByText(/with a total value of/)).toBeVisible();

    const summary = bbat.table(page.getByRole('table').nth(0));
    await expect(summary.rows()).toHaveCount(1);
    const row = summary.row(0);
    await expect(row.getCell('Count')).toHaveText('1');
    await expect(row.getCell('Price')).toHaveText(formatEuro(cents(1337)));
    await expect(row.getCell('Total')).toHaveText(formatEuro(cents(1337)));
    await page.getByRole('button', { name: 'Create debts' }).click();

    await page.waitForURL(
      url =>
        !!url.pathname.match(
          /\/admin\/debt-centers\/[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}/,
        ),
    );

    const debtsTable = bbat.table(
      bbat.getResourceSection('Debts').getByRole('table'),
    );
    await expect(debtsTable.rows()).toHaveCount(1);

    const olliRow = debtsTable.getRowByColumnValue('Payer', 'Olli Osallistuja');
    await expect(olliRow.getCell('Amount')).toHaveText(formatEuro(cents(1337)));
  });

  test('case: single event, no queue, answer rules', async ({ bbat, page }) => {
    mockEventDetails(bbat, [
      {
        fields: [
          { id: 1, name: 'Sillis?', type: 'radio', options: ['on', 'off'] },
        ],
        registrations: [
          {
            name: 'Olli Osallistuja',
            answers: [{ questionId: 1, question: 'Sillis?', answer: 'on' }],
          },
          {
            name: 'Ilmari Ilmoittautuja',
            answers: [{ questionId: 1, question: 'Sillis?', answer: 'off' }],
          },
        ],
      },
    ]);

    await page.goto(bbat.url);
    await bbat.login({});
    await page.goto(`${bbat.url}/admin/debt-centers/create-from-event`);

    await page.getByRole('button', { name: 'Test Event' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByPlaceholder('Name').fill('Test Event');

    await page
      .getByRole('button', { name: 'Create component mapping' })
      .click();
    await page
      .locator('.component-mapping')
      .getByPlaceholder('Name')
      .fill('Sillis');
    await page
      .locator('.component-mapping')
      .getByPlaceholder('Price')
      .fill('20');
    await expect(
      page
        .locator('.component-mapping')
        .getByRole('button', { name: 'Add rule' }),
    ).not.toBeDisabled();
    await page
      .locator('.component-mapping')
      .getByRole('button', { name: 'Add rule' })
      .click();
    const dialog = bbat.getDialog('Add pricing rule');

    await dialog.getByRole('combobox').nth(0).click();
    const controlsId = await dialog
      .getByRole('combobox')
      .nth(0)
      .getAttribute('aria-controls');
    await page
      .locator(`[id='${controlsId}']`)
      .getByRole('option', { name: 'Test Event' })
      .click();

    await dialog.getByRole('combobox').nth(1).click();
    const controls2Id = await dialog
      .getByRole('combobox')
      .nth(1)
      .getAttribute('aria-controls');
    await page
      .locator(`[id='${controls2Id}']`)
      .getByRole('option', { name: 'Sillis?' })
      .click();

    await dialog.getByRole('combobox').nth(2).click();
    const controls3Id = await dialog
      .getByRole('combobox')
      .nth(2)
      .getAttribute('aria-controls');
    await page
      .locator(`[id='${controls3Id}']`)
      .getByRole('option', { name: 'on' })
      .click();

    await dialog.getByRole('button', { name: 'Create' }).click();

    await page.getByRole('button', { name: 'Continue' }).click();

    const participants = bbat.table(page.getByRole('table').nth(0));

    await expect(participants.rows()).toHaveCount(2);

    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page.getByText(/with a total value of/)).toBeVisible();

    const summary = bbat.table(page.getByRole('table').nth(0));
    await expect(summary.rows()).toHaveCount(2);

    const baseRow = summary.getRowByColumnValue('Component', 'Base Price');
    await expect(baseRow.getCell('Count')).toHaveText('2');
    await expect(baseRow.getCell('Price')).toHaveText(formatEuro(cents(1337)));
    await expect(baseRow.getCell('Total')).toHaveText(
      formatEuro(cents(1337 * 2)),
    );

    const sillisRow = summary.getRowByColumnValue('Component', 'Sillis');
    await expect(sillisRow.getCell('Count')).toHaveText('1');
    await expect(sillisRow.getCell('Price')).toHaveText(
      formatEuro(cents(2000)),
    );
    await expect(sillisRow.getCell('Total')).toHaveText(
      formatEuro(cents(2000)),
    );

    await page.getByRole('button', { name: 'Create debts' }).click();

    await page.waitForURL(
      url =>
        !!url.pathname.match(
          /\/admin\/debt-centers\/[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}/,
        ),
    );

    const debtsTable = bbat.table(
      bbat.getResourceSection('Debts').getByRole('table'),
    );
    await expect(debtsTable.rows()).toHaveCount(2);

    const olliRow = debtsTable.getRowByColumnValue('Payer', 'Olli Osallistuja');
    await expect(olliRow.getCell('Amount')).toHaveText(
      formatEuro(cents(1337 + 2000)),
    );
    await expect(olliRow.getCell('Components')).toHaveText(/Base Price/i);
    await expect(olliRow.getCell('Components')).toHaveText(/Sillis/i);

    const ilmariRow = debtsTable.getRowByColumnValue(
      'Payer',
      'Ilmari Ilmoittautuja',
    );
    await expect(ilmariRow.getCell('Amount')).toHaveText(
      formatEuro(cents(1337)),
    );
    await expect(ilmariRow.getCell('Components')).toHaveText(/Base Price/i);
    await expect(ilmariRow.getCell('Components')).not.toHaveText(/Sillis/i);
  });

  test('removing from participants', async ({ bbat, page }) => {
    mockEventDetails(bbat, [
      {
        registrations: [
          { name: 'Olli Osallistuja' },
          { name: 'Ilmari Ilmoittautuja' },
          { name: 'Benjamin Bilettäjä' },
        ],
        maxParticipants: 2,
      },
    ]);

    await page.goto(bbat.url);
    await bbat.login({});
    await page.goto(`${bbat.url}/admin/debt-centers/create-from-event`);

    await page.getByRole('button', { name: 'Test Event' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByPlaceholder('Name').fill('Test Event');
    await page.getByRole('button', { name: 'Continue' }).click();

    const participants = bbat.table(page.getByRole('table').nth(0));
    const queue = bbat.table(page.getByRole('table').nth(1));

    await expect(participants.rows()).toHaveCount(2);
    await expect(queue.rows()).toHaveCount(1);

    await participants.row(1).action('Move to queue');

    await expect(participants.rows()).toHaveCount(1);
    await expect(queue.rows()).toHaveCount(2);

    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page.getByText(/with a total value of/)).toBeVisible();

    const summary = bbat.table(page.getByRole('table').nth(0));
    await expect(summary.rows()).toHaveCount(1);
    const row = summary.row(0);
    await expect(row.getCell('Count')).toHaveText('1');
    await expect(row.getCell('Price')).toHaveText(formatEuro(cents(1337)));
    await expect(row.getCell('Total')).toHaveText(formatEuro(cents(1337)));
    await page.getByRole('button', { name: 'Create debts' }).click();

    await page.waitForURL(
      url =>
        !!url.pathname.match(
          /\/admin\/debt-centers\/[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}/,
        ),
    );

    const debtsTable = bbat.table(
      bbat.getResourceSection('Debts').getByRole('table'),
    );
    await expect(debtsTable.rows()).toHaveCount(1);

    const olliRow = debtsTable.getRowByColumnValue('Payer', 'Olli Osallistuja');
    await expect(olliRow.getCell('Amount')).toHaveText(formatEuro(cents(1337)));
  });

  test('including people from the queue', async ({ bbat, page }) => {
    mockEventDetails(bbat, [
      {
        registrations: [
          { name: 'Olli Osallistuja' },
          { name: 'Ilmari Ilmoittautuja' },
          { name: 'Benjamin Bilettäjä' },
        ],
        maxParticipants: 1,
      },
    ]);

    await page.goto(bbat.url);
    await bbat.login({});
    await page.goto(`${bbat.url}/admin/debt-centers/create-from-event`);

    await page.getByRole('button', { name: 'Test Event' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByPlaceholder('Name').fill('Test Event');
    await page.getByRole('button', { name: 'Continue' }).click();

    const participants = bbat.table(page.getByRole('table').nth(0));
    const queue = bbat.table(page.getByRole('table').nth(1));

    await expect(participants.rows()).toHaveCount(1);
    await expect(queue.rows()).toHaveCount(2);

    await queue.row(0).action('Move to participants');

    await expect(participants.rows()).toHaveCount(2);
    await expect(queue.rows()).toHaveCount(1);

    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page.getByText(/with a total value of/)).toBeVisible();

    const summary = bbat.table(page.getByRole('table').nth(0));
    await expect(summary.rows()).toHaveCount(1);
    const row = summary.row(0);
    await expect(row.getCell('Count')).toHaveText('2');
    await expect(row.getCell('Price')).toHaveText(formatEuro(cents(1337)));
    await expect(row.getCell('Total')).toHaveText(formatEuro(cents(1337 * 2)));
    await page.getByRole('button', { name: 'Create debts' }).click();

    await page.waitForURL(
      url =>
        !!url.pathname.match(
          /\/admin\/debt-centers\/[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}/,
        ),
    );

    const debtsTable = bbat.table(
      bbat.getResourceSection('Debts').getByRole('table'),
    );
    await expect(debtsTable.rows()).toHaveCount(2);

    const olliRow = debtsTable.getRowByColumnValue('Payer', 'Olli Osallistuja');
    await expect(olliRow.getCell('Amount')).toHaveText(formatEuro(cents(1337)));

    const ilmariRow = debtsTable.getRowByColumnValue(
      'Payer',
      'Ilmari Ilmoittautuja',
    );
    await expect(ilmariRow.getCell('Amount')).toHaveText(
      formatEuro(cents(1337)),
    );
  });

  test('case: two events, no queue, answer rules', async ({ bbat, page }) => {
    mockEventDetails(bbat, [
      {
        name: 'Sitsit (Vanhat)',
        fields: [
          { id: 1, name: 'Jatkot', type: 'radio', options: ['on', 'off'] },
        ],
        registrations: [
          {
            name: 'Olli Osallistuja',
            answers: [{ questionId: 1, question: 'Jatkot', answer: 'on' }],
          },
          {
            name: 'Ilmari Ilmoittautuja',
            answers: [{ questionId: 1, question: 'Jatkot', answer: 'off' }],
          },
        ],
      },
      {
        name: 'Sitsit (Fuksit)',
        fields: [
          { id: 2, name: 'Jatkot', type: 'radio', options: ['on', 'off'] },
        ],
        registrations: [
          {
            name: 'Benjamin Bilettäjä',
            answers: [{ questionId: 2, question: 'Jatkot', answer: 'on' }],
          },
          {
            name: 'Salla Sitsaaja',
            answers: [{ questionId: 2, question: 'Jatkot', answer: 'off' }],
          },
        ],
      },
    ]);

    await page.goto(bbat.url);
    await bbat.login({});
    await page.goto(`${bbat.url}/admin/debt-centers/create-from-event`);

    await page.getByRole('button', { name: 'Sitsit (Vanhat)' }).click();
    await page.getByRole('button', { name: 'Sitsit (Fuksit)' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByPlaceholder('Name').fill('Test Event');

    await page
      .getByRole('button', { name: 'Create component mapping' })
      .click();

    await page
      .locator('.component-mapping')
      .getByPlaceholder('Name')
      .fill('Jatkot');
    await page
      .locator('.component-mapping')
      .getByPlaceholder('Price')
      .fill('5');
    await expect(
      page
        .locator('.component-mapping')
        .getByRole('button', { name: 'Add rule' }),
    ).not.toBeDisabled();

    for (const event of ['Sitsit (Vanhat)', 'Sitsit (Fuksit)']) {
      await page
        .locator('.component-mapping')
        .getByRole('button', { name: 'Add rule' })
        .click();

      const dialog = bbat.getDialog('Add pricing rule');

      await dialog.getByRole('combobox').nth(0).click();
      const controlsId = await dialog
        .getByRole('combobox')
        .nth(0)
        .getAttribute('aria-controls');
      await page
        .locator(`[id='${controlsId}']`)
        .getByRole('option', { name: event })
        .click();

      await dialog.getByRole('combobox').nth(1).click();
      const controls2Id = await dialog
        .getByRole('combobox')
        .nth(1)
        .getAttribute('aria-controls');
      await page
        .locator(`[id='${controls2Id}']`)
        .getByRole('option', { name: 'Jatkot' })
        .click();

      await dialog.getByRole('combobox').nth(2).click();
      const controls3Id = await dialog
        .getByRole('combobox')
        .nth(2)
        .getAttribute('aria-controls');
      await page
        .locator(`[id='${controls3Id}']`)
        .getByRole('option', { name: 'on' })
        .click();

      await dialog.getByRole('button', { name: 'Create' }).click();
    }

    await page.getByRole('button', { name: 'Continue' }).click();

    const participants = bbat.table(page.getByRole('table').nth(0));

    await expect(participants.rows()).toHaveCount(4);

    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page.getByText(/with a total value of/)).toBeVisible();

    const summary = bbat.table(page.getByRole('table').nth(0));
    await expect(summary.rows()).toHaveCount(2);

    const baseRow = summary.getRowByColumnValue('Component', 'Base Price');
    await expect(baseRow.getCell('Count')).toHaveText('4');
    await expect(baseRow.getCell('Price')).toHaveText(formatEuro(cents(1337)));
    await expect(baseRow.getCell('Total')).toHaveText(
      formatEuro(cents(1337 * 4)),
    );

    const sillisRow = summary.getRowByColumnValue('Component', 'Jatkot');
    await expect(sillisRow.getCell('Count')).toHaveText('2');
    await expect(sillisRow.getCell('Price')).toHaveText(formatEuro(cents(500)));
    await expect(sillisRow.getCell('Total')).toHaveText(
      formatEuro(cents(500 * 2)),
    );

    await page.getByRole('button', { name: 'Create debts' }).click();

    await page.waitForURL(
      url =>
        !!url.pathname.match(
          /\/admin\/debt-centers\/[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}/,
        ),
    );

    const debtsTable = bbat.table(
      bbat.getResourceSection('Debts').getByRole('table'),
    );
    await expect(debtsTable.rows()).toHaveCount(4);

    const olliRow = debtsTable.getRowByColumnValue('Payer', 'Olli Osallistuja');
    await expect(olliRow.getCell('Amount')).toHaveText(
      formatEuro(cents(1337 + 500)),
    );
    await expect(olliRow.getCell('Components')).toHaveText(/Base Price/i);
    await expect(olliRow.getCell('Components')).toHaveText(/Jatkot/i);

    const ilmariRow = debtsTable.getRowByColumnValue(
      'Payer',
      'Ilmari Ilmoittautuja',
    );
    await expect(ilmariRow.getCell('Amount')).toHaveText(
      formatEuro(cents(1337)),
    );
    await expect(ilmariRow.getCell('Components')).toHaveText(/Base Price/i);
    await expect(ilmariRow.getCell('Components')).not.toHaveText(/Jatkot/i);

    const benjaminRow = debtsTable.getRowByColumnValue(
      'Payer',
      'Benjamin Bilettäjä',
    );
    await expect(benjaminRow.getCell('Amount')).toHaveText(
      formatEuro(cents(1337 + 500)),
    );
    await expect(benjaminRow.getCell('Components')).toHaveText(/Base Price/i);
    await expect(benjaminRow.getCell('Components')).toHaveText(/Jatkot/i);

    const sallaRow = debtsTable.getRowByColumnValue('Payer', 'Salla Sitsaaja');
    await expect(sallaRow.getCell('Amount')).toHaveText(
      formatEuro(cents(1337)),
    );
    await expect(sallaRow.getCell('Components')).toHaveText(/Base Price/i);
    await expect(sallaRow.getCell('Components')).not.toHaveText(/Jatkot/i);
  });
});

test.describe('public site', () => {
  test(`mark debt as paid`, async ({ bbat, page }) => {
    await page.goto(bbat.url);
    await bbat.login({});
    await page.goto(bbat.url);

    await page.getByRole('button', { name: 'Create test debt' }).click();
    await expect(page.getByRole('heading', { name: 'Test Debt' })).toHaveCount(
      1,
    );
    await expect(page.getByText(/marked as paid/i)).toHaveCount(0);
    await page.getByRole('button', { name: /mark as paid/i }).click();
    await expect(page.getByText(/marked as paid/i)).toHaveCount(1);
    await page.getByRole('button', { name: /mark as unpaid/i }).click();
    await expect(page.getByText(/marked as paid/i)).toHaveCount(0);
  });
});
