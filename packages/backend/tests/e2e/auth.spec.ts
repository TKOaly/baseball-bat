import { expect } from '@playwright/test';
import { test } from './fixtures';
import { createPayerProfileFromTkoalyIdentity } from '@/services/payers/definitions';
import { tkoalyIdentity } from '@bbat/common/types';
import { getUpstreamUserById } from '@/services/users/definitions';

test('site accessible', async ({ page, bbat }) => {
  await page.goto(bbat.url);
  await expect(page).toHaveTitle('TKO-äly ry - Maksupalvelu');
});

test('email auth', async ({ page, bbat }) => {
  bbat.mockProcedure(getUpstreamUserById, async ({ id }) => ({
    id,
    screenName: 'Teppo Testaaja',
    email: 'test@test.test',
    username: 'tteppo',
    role: 'yllapitaja' as const,
  }));

  await bbat.withContext(async ctx => {
    await ctx.exec(createPayerProfileFromTkoalyIdentity, {
      id: tkoalyIdentity(1234),
      token: 'TEST-TOKEN',
    });
  });

  await page
    .context()
    .addCookies([{ name: 'token', value: 'TEST-TOKEN', url: bbat.url }]);

  const email = await bbat.mockEmailTransport();

  await page.goto(bbat.url);
  await page.getByText('Email').click();
  await page.getByPlaceholder('Email').fill('test@test.test');
  await page.getByText('Send Confirmation').click();
  expect(page.getByText('No user with such email in the system.')).toHaveCount(
    0,
  );

  await new Promise(resolve => setTimeout(resolve, 1000));

  const codeRegex = /Your authentication code is ([A-Z0-9]{8})./;

  expect(email.calls.length).toEqual(1);
  expect((email.calls[0].arguments[0] as any).text).toMatch(codeRegex);

  const content = (email.calls[0].arguments[0] as any).text as string;
  const code = content.match(codeRegex)![1];

  await page.getByPlaceholder('Confirmation Code').fill(code);
  await page.locator('button').getByText('Confirmation').click();

  await page.getByText('Continue').click();

  await expect(page.getByText(/Hi, Teppo Testaaja!/)).toHaveCount(1);
});
