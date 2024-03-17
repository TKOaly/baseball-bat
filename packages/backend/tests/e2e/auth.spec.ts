import { expect } from '@playwright/test';
import { test } from './fixtures';
import { createPayerProfileFromTkoalyIdentity } from '@/modules/payers/definitions';
import { tkoalyIdentity } from '@bbat/common/types';
import { getUpstreamUserById } from '@/modules/users/definitions';

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
    });
  });

  await page
    .context()
    .addCookies([{ name: 'token', value: 'TEST-TOKEN', url: bbat.url }]);

  const email = await bbat.mockEmailTransport();

  await page.goto(bbat.url);
  await page.getByPlaceholder('Sähköpostisi').fill('test@test.test');
  await page.getByText('Jatka').click();
  expect(page.getByText('Sähköpostilla ei ole käyttäjää!')).toHaveCount(0);

  await new Promise(resolve => setTimeout(resolve, 1000));

  const codeRegex = /Your authentication code is ([A-Z0-9]{8})./;

  expect(email.calls.length).toEqual(1);
  expect((email.calls[0].arguments[0] as any).text).toMatch(codeRegex);

  const content = (email.calls[0].arguments[0] as any).text as string;
  const code = content.match(codeRegex)![1];

  await page.getByTestId('auth-code-0').fill(code);

  await expect(page.getByText(/Hi, Teppo Testaaja!/)).toHaveCount(1);
});
