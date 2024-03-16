import { spawn } from 'child_process';
import assert from 'assert';
import setup, { CustomTestHandler, UnitTestEnvironment } from './setup';
import { createPayment, getPayment } from '@/modules/payments/definitions';
import { euro } from '@bbat/common/currency';

const startStripe = async (env: UnitTestEnvironment) => {
  return new Promise<() => Promise<void>>((resolve, reject) => {
    const abortController = new AbortController();
    let finished = false;

    const stripeHandle = spawn(
      'stripe',
      [
        'listen',
        '-s',
        '--api-key',
        env.env.config.stripeSecretKey,
        '--forward-to',
        `${env.url}/api/stripe/webhook`,
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

const stripe = async (...args: string[]) => {
  return new Promise<void>((resolve, reject) => {
    const handle = spawn('stripe', args);

    handle.on('exit', code => {
      if (code === 0) {
        resolve();
      } else {
        reject();
      }
    });
  });
};

const triggerWebhook = async (
  name: string,
  add: Record<string, string | number> = {},
) => {
  const args = ['trigger', name];

  Object.entries(add).forEach(([key, value]) => {
    args.push('--override', `${key}=${value}`);
  });

  return stripe(...args);
};

const retry = async <T>(fn: () => Promise<T>, count = 5): Promise<T> => {
  try {
    return await fn();
  } catch (err) {
    if (count > 0) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      return await retry(fn, count - 1);
    } else {
      throw err;
    }
  }
};

setup('Stripe Webhooks', ({ test: origTest }) => {
  const test = (name: string, fn: CustomTestHandler) =>
    origTest(name, async env => {
      const stopStripe = await startStripe(env);

      try {
        return await fn(env);
      } finally {
        await stopStripe();
      }
    });

  test('payment_intent.succeeded', async ({ withContext }) => {
    const payment = await withContext(async bus => {
      return bus.exec(createPayment, {
        payment: {
          title: 'Test Payment',
          amount: euro(8),
          message: 'Test Message',
          type: 'stripe',
          data: {},
        },
      });
    });

    assert.ok(payment);

    await triggerWebhook('payment_intent.succeeded', {
      'payment_intent:amount': payment.initialAmount.value,
      'payment_intent:currency': 'eur',
      'payment_intent:metadata.paymentId': payment.id,
    });

    await retry(() =>
      withContext(async bus => {
        const newPayment = await bus.exec(getPayment, payment.id);
        assert.ok(newPayment);
        assert.equal(newPayment.status, 'paid');
        assert.equal(newPayment.events.length, 3);
      }),
    );
  });

  test('payment_intent.payment_failed', async ({ withContext }) => {
    const payment = await withContext(async bus => {
      return bus.exec(createPayment, {
        payment: {
          title: 'Test Payment',
          amount: euro(8),
          message: 'Test Message',
          type: 'stripe',
          data: {},
        },
      });
    });

    assert.ok(payment);

    await triggerWebhook('payment_intent.payment_failed', {
      'payment_intent:amount': payment.initialAmount.value,
      'payment_intent:currency': 'eur',
      'payment_intent:metadata.paymentId': payment.id,
    });

    await retry(() =>
      withContext(async bus => {
        const newPayment = await bus.exec(getPayment, payment.id);
        assert.ok(newPayment);
        assert.equal(newPayment.status, 'unpaid');
        assert.equal(newPayment.events.length, 3);
      }),
    );
  });
});
