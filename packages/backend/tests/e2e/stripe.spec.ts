import { expect } from '@playwright/test';
import { spawn } from 'child_process';
import { E2ETestEnvironment, test } from './fixtures';
import {
  createDebt,
  createDebtComponent,
  publishDebt,
} from '@/modules/debts/definitions';
import { getYear } from 'date-fns';
import { createDebtCenter } from '@/modules/debt-centers/definitions';
import { euro } from '@bbat/common/currency';
import assert from 'assert';
import { PayerProfile } from '@bbat/common/types';

const startStripe = async (bbat: E2ETestEnvironment) => {
  return new Promise<() => Promise<void>>((resolve, reject) => {
    const abortController = new AbortController();
    let finished = false;

    const stripeHandle = spawn(
      'stripe',
      [
        'listen',
        '-s',
        '--api-key',
        bbat.env.config.stripeSecretKey,
        '--forward-to',
        `${bbat.url}/api/stripe/webhook`,
      ],
      {
        signal: abortController.signal,
        stdio: 'pipe',
      },
    );

    const abortFn = () =>
      new Promise<void>(resolve => {
        if (stripeHandle.exitCode !== null) {
          resolve();
          return;
        }

        stripeHandle.on('exit', () => resolve());
        abortController.abort();
      });

    stripeHandle.on('error', (err: Error) => {
      if (err.name === 'AbortError') {
        return;
      }

      console.error('Stripe CLI sub-process error:', err);
    });

    stripeHandle.stderr.on('data', (data: string) => {
      if (data.toString().includes('Ready!')) {
        finished = true;
        resolve(abortFn);
      }
    });

    stripeHandle.on('exit', () => {
      if (!finished) {
        reject();
      }
    });
  });
};

let payer!: PayerProfile;
let closeStripe: (() => Promise<void>) | null;

test.beforeEach(async ({ page, bbat }) => {
  await page.goto(bbat.url);

  await page
    .context()
    .addCookies([{ name: 'token', value: 'TEST-TOKEN', url: bbat.url }]);

  payer = await bbat.login({
    screenName: 'John Smith',
  });

  closeStripe = await startStripe(bbat);
});

test.afterEach(async () => {
  if (closeStripe) {
    await closeStripe();
    closeStripe = null;
  }
});

const createAndPay = async (
  bbat: E2ETestEnvironment,
  options: { card: string },
) => {
  const { page } = bbat;

  await bbat.withContext(async bus => {
    const accountingPeriod = getYear(new Date()) as any;

    const center = await bus.exec(createDebtCenter, {
      name: 'Test Center',
      description: '',
      url: '',
      accountingPeriod,
    });

    assert.ok(center);

    const component = await bus.exec(createDebtComponent, {
      name: 'Test Component',
      description: '',
      amount: euro(8),
      debtCenterId: center.id,
    });

    assert.ok(component);

    const debt = await bus.exec(createDebt, {
      debt: {
        name: 'Test Stripe Debt',
        description: '',
        components: [component.id],
        payer: payer.id,
        centerId: center.id,
        accountingPeriod,
        tags: [],
      },
    });

    assert.ok(debt);

    await bus.exec(publishDebt, debt.id);
  });

  await page.goto(bbat.url + '/debts');

  await page.getByRole('link', { name: /pay now/i }).click();

  await page.getByTestId('stripe-button').click();

  await page.evaluate(url => ((window as any).TEST_APP_URL = url), bbat.url);

  await page.getByText(/methods may differ/).click();

  const frame = page
    .locator('[data-stripe-ready="true"]')
    .frameLocator('[title="Secure payment input frame"]');

  await expect(frame.getByRole('button', { name: 'Card' })).toBeVisible();

  await page.waitForTimeout(1000);

  await frame.getByRole('button', { name: 'Card' }).click();
  await frame.locator('#Field-numberInput').fill(options.card);
  await frame.locator('#Field-expiryInput').fill('1234');
  await frame.locator('#Field-cvcInput').fill('123');

  // GitHub Actions run in the USA, where a ZIP code field is shown.
  const zipCodeField = frame.locator('#Field-postalCodeInput');

  if (await zipCodeField.isVisible()) {
    // A real, valid, ZIP code for Finland, Minnesota.
    await zipCodeField.fill('55603');
  }

  await page.waitForTimeout(1000);

  await page.getByTestId('pay-now').click();
};

test.describe('full flow', () => {
  test.skip(
    () => !!process.env.CI,
    'Skipping tests involving Stripe Elements in the CI!',
  );
  test.slow();

  test('successfull', async ({ page, bbat }) => {
    test.slow();

    await createAndPay(bbat, {
      card: '42'.repeat(8),
    });

    await expect(page.getByRole('button', { name: 'Pay now' })).not.toBeVisible(
      {
        timeout: 10000,
      },
    );

    await expect(
      page.getByRole('heading', { name: /Hi, John Smith!/ }),
    ).toBeVisible();
    await expect(page.getByText(/You have no unpaid debts/)).toBeVisible();
  });

  test('generic decline', async ({ page, bbat }) => {
    test.slow();

    await createAndPay(bbat, {
      card: '4000000000000002',
    });

    await expect(page.getByText(/Your card has been declined./)).toBeVisible();
    await page.goto(bbat.url);

    await expect(
      page.getByRole('heading', { name: /Hi, John Smith!/ }),
    ).toBeVisible();
    await expect(page.getByText(/You have 1 unpaid/)).toBeVisible();
  });

  test('3D secure authentication success', async ({ page, bbat }) => {
    test.slow();

    await createAndPay(bbat, {
      card: '4000002760003184',
    });

    const frame = page
      .frameLocator('[name^="__privateStripeFrame"]')
      .first()
      .frameLocator('[name="stripe-challenge-frame"]');

    await frame.getByRole('button', { name: 'Complete' }).click();

    await expect(
      page.getByRole('heading', { name: /Hi, John Smith!/ }),
    ).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/You have no unpaid debts/)).toBeVisible();
  });

  test('3D secure authentication failure', async ({ page, bbat }) => {
    test.slow();

    await createAndPay(bbat, {
      card: '4000002760003184',
    });

    const frame = page
      .frameLocator('[name^="__privateStripeFrame"]')
      .first()
      .frameLocator('[name="stripe-challenge-frame"]');

    await frame.getByRole('button', { name: 'Fail' }).click();

    await expect(
      page.getByRole('heading', { name: 'Payment failed' }),
    ).toBeVisible({ timeout: 10000 });
  });

  test('disputed as not received', async ({ page, bbat }) => {
    test.slow();

    await createAndPay(bbat, {
      card: '4000000000002685',
    });

    await expect(page.getByText(/You have 1 unpaid debts/)).toBeVisible();
  });
});
