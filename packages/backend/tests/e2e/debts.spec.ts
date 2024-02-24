import { expect } from '@playwright/test';
import { test } from './fixtures';

test('debt creation', async ({ page, bbat }) => {
  await page.goto(bbat.url);
  await page
    .context()
    .addCookies([{ name: 'token', value: 'TEST-TOKEN', url: bbat.url }]);

  await bbat.login({
    screenName: 'John Smith',
  });

  await page.goto(`${bbat.url}/admin/debts/create`);
  await page.getByPlaceholder('Name').fill('Test Debt');
  await page
    .getByText('Center')
    .locator('..')
    .locator('input')
    .fill('Test Center');
  await page.getByText('Create "Test Center"').click();
  await page.getByText('Payer').locator('..').locator('input').fill('Matti');
  await page.getByText('Create "Matti"').click();
  await page.getByPlaceholder('Email address').fill('matti@example.com');
  await page.locator('.dialog-base').getByText('Create').click();
  await page.getByTestId('tabular-field-list-add-button').click();
  await page
    .locator('[data-row="0"][data-column="component"] input')
    .fill('Test');
  await page.getByText('Create "Test"').click();
  await page
    .locator('[data-row="0"][data-column="amount"] input')
    .fill('10,00');
  await page.getByTestId('create-debt').click();
  await expect(page.getByText('Not published')).toBeVisible();
});
