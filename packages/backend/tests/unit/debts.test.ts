import setup from './setup';
import * as defs from '../../src/modules/debts/definitions';
import assert from 'node:assert';
import { createDebtCenter } from '../../src/modules/debt-centers/definitions';
import { createPayerProfileFromEmailIdentity } from '../../src/modules/payers/definitions';
import {
  dateToDbDateString,
  emailIdentity,
  euro,
} from '@bbat/common/src/types';
import { getEmails } from '../../src/modules/email/definitions';
import {
  createPaymentEvent,
  getDefaultInvoicePaymentForDebt,
} from '@/modules/payments/definitions';
import { subDays } from 'date-fns/subDays';
import { pipe } from 'remeda';
import { describe } from 'node:test';

setup('Debts service', ({ test }) => {
  test('debt creation', async ({ bus }) => {
    const payer = await bus.exec(createPayerProfileFromEmailIdentity, {
      id: emailIdentity('test@test.test'),
      name: 'Teppo Testaaja',
    });

    assert.ok(payer);

    const center = await bus.exec(createDebtCenter, {
      name: 'Test Center',
      accountingPeriod: 2024,
      description: 'Desc',
      url: 'https://google.com/',
    });

    await bus.exec(defs.createDebt, {
      debt: {
        name: 'Name',
        description: 'Desc',
        centerId: center.id,
        accountingPeriod: 2024 as any,
        components: [],
        payer: payer.id,
        tags: [],
      },
    });
  });

  test('debt publishing', async ({ bus }) => {
    const payer = await bus.exec(createPayerProfileFromEmailIdentity, {
      id: emailIdentity('test@test.test'),
      name: 'Teppo Testaaja',
    });

    assert.ok(payer);

    const center = await bus.exec(createDebtCenter, {
      name: 'Test Center',
      accountingPeriod: 2024,
      description: 'Desc',
      url: 'https://google.com/',
    });

    const component = await bus.exec(defs.createDebtComponent, {
      debtCenterId: center.id,
      name: 'Test Component',
      amount: euro(10),
      description: 'Test',
    });

    const debt = await bus.exec(defs.createDebt, {
      debt: {
        name: 'Name',
        description: 'Desc',
        centerId: center.id,
        accountingPeriod: 2024 as any,
        components: [component.id],
        payer: payer.id,
        paymentCondition: 14,
        tags: [],
      },
    });

    await bus.exec(defs.publishDebt, debt.id);

    const newDebt = await bus.exec(defs.getDebt, debt.id);

    assert.ok(newDebt);

    assert.equal(newDebt.id, debt.id);
    assert.equal(newDebt.status, 'unpaid');
    assert.notEqual(newDebt.publishedAt, null);
    assert.notEqual(newDebt.createdAt, null);
    assert.ok(!newDebt.draft);
    assert.ok(!newDebt.credited);

    const { result: emails } = await bus.exec(getEmails, {});

    assert.equal(emails.length, 1);
    assert.equal(emails[0].template, 'new-invoice');
    assert.equal(emails[0].subject, '[Lasku / Invoice] Name');
    assert.equal(emails[0].recipient, 'test@test.test');
  });

  test('debt crediting', async ({ bus }) => {
    const payer = await bus.exec(createPayerProfileFromEmailIdentity, {
      id: emailIdentity('test@test.test'),
      name: 'Teppo Testaaja',
    });

    assert.ok(payer);

    const center = await bus.exec(createDebtCenter, {
      name: 'Test Center',
      accountingPeriod: 2024,
      description: 'Desc',
      url: 'https://google.com/',
    });

    const component = await bus.exec(defs.createDebtComponent, {
      debtCenterId: center.id,
      name: 'Test Component',
      amount: euro(10),
      description: 'Test',
    });

    const debt = await bus.exec(defs.createDebt, {
      debt: {
        name: 'Name',
        description: 'Desc',
        centerId: center.id,
        accountingPeriod: 2024 as any,
        components: [component.id],
        payer: payer.id,
        paymentCondition: 14,
        tags: [],
      },
    });

    await bus.exec(defs.publishDebt, debt.id);
    await bus.exec(defs.creditDebt, debt.id);

    const newDebt = await bus.exec(defs.getDebt, debt.id);

    assert.ok(newDebt);

    assert.equal(newDebt.id, debt.id);
    assert.equal(newDebt.status, 'unpaid');
    assert.notEqual(newDebt.publishedAt, null);
    assert.notEqual(newDebt.createdAt, null);
    assert.ok(!newDebt.draft);
    assert.ok(newDebt.credited);

    const { result: emails } = await bus.exec(getEmails, {});

    assert.equal(emails.length, 2);
  });

  test('paying debt', async ({ bus }) => {
    const payer = await bus.exec(createPayerProfileFromEmailIdentity, {
      id: emailIdentity('test@test.test'),
      name: 'Teppo Testaaja',
    });

    assert.ok(payer);

    const center = await bus.exec(createDebtCenter, {
      name: 'Test Center',
      accountingPeriod: 2024,
      description: 'Desc',
      url: 'https://google.com/',
    });

    const component = await bus.exec(defs.createDebtComponent, {
      debtCenterId: center.id,
      name: 'Test Component',
      amount: euro(10),
      description: 'Test',
    });

    const debt = await bus.exec(defs.createDebt, {
      debt: {
        name: 'Name',
        description: 'Desc',
        centerId: center.id,
        accountingPeriod: 2024 as any,
        components: [component.id],
        payer: payer.id,
        paymentCondition: 14,
        tags: [],
      },
    });

    await bus.exec(defs.publishDebt, debt.id);

    const payment = await bus.exec(defs.createPayment, {
      debts: [debt.id],
      payment: {
        type: 'cash',
        title: 'Title',
        message: 'Desc.',
      },
    });

    await bus.exec(createPaymentEvent, {
      paymentId: payment.id,
      type: 'payment',
      amount: euro(10),
      transaction: null,
    });

    const newDebt = await bus.exec(defs.getDebt, debt.id);

    assert.ok(newDebt);

    assert.equal(newDebt.id, debt.id);
    assert.notEqual(newDebt.publishedAt, null);
    assert.notEqual(newDebt.createdAt, null);
    assert.ok(!newDebt.draft);
    assert.ok(!newDebt.credited);
    assert.equal(newDebt.status, 'paid');
  });

  describe('reminders', () => {
    const combine =
      <N extends string, V extends unknown[]>(name: N, values: V) =>
      <A extends Array<Record<string, unknown>>>(
        array: A,
      ): {
        [VK in number]: { [AK in number]: A[AK] & Record<N, V[VK]> }[number];
      }[number][] =>
        array.flatMap(item =>
          values.map(value => ({ ...item, [name]: value })),
        ) as any;

    const tests = pipe(
      [{}],
      combine('published', [true, false]),
      combine('paid', [true, false]),
      combine('credited', [true, false]),
      combine('overdue', [true, false]),
    );

    for (const options of tests) {
      const { published, paid, credited, overdue } = options;

      if ((!published && paid) || (!published && credited)) {
        return;
      }

      const features = Object.entries(options)
        .map(([key, value]) => `${key}=${value}`)
        .join(', ');

      const shouldBeSent = published && !paid && !credited && overdue;

      const title = `${features} -> reminder ${shouldBeSent ? 'sent' : 'not sent'}`;

      test(title, async ({ bus }) => {
        const payer = await bus.exec(createPayerProfileFromEmailIdentity, {
          id: emailIdentity('test@test.test'),
          name: 'Teppo Testaaja',
        });

        assert.ok(payer);

        const center = await bus.exec(createDebtCenter, {
          name: 'Test Center',
          accountingPeriod: 2024,
          description: 'Desc',
          url: 'https://google.com/',
        });

        const component = await bus.exec(defs.createDebtComponent, {
          debtCenterId: center.id,
          name: 'Test Component',
          amount: euro(10),
          description: 'Test',
        });

        const debt = await bus.exec(defs.createDebt, {
          debt: {
            name: 'Name',
            description: 'Desc',
            centerId: center.id,
            accountingPeriod: 2024 as any,
            components: [component.id],
            payer: payer.id,
            dueDate: overdue
              ? dateToDbDateString(subDays(new Date(), 1))
              : undefined,
            tags: [],
          },
        });

        if (published) {
          await bus.exec(defs.publishDebt, debt.id);

          if (paid) {
            const payment = await bus.exec(
              getDefaultInvoicePaymentForDebt,
              debt.id,
            );

            assert.ok(payment);

            await bus.exec(createPaymentEvent, {
              paymentId: payment.id,
              type: 'payment',
              amount: euro(10),
              data: {},
              transaction: null,
            });
          }

          if (credited) {
            await bus.exec(defs.creditDebt, debt.id);
          }
        }

        const result = await bus.exec(defs.sendAllReminders, {
          draft: false,
          ignoreReminderCooldown: true,
          debts: [debt.id],
        });

        if (shouldBeSent) {
          assert.equal(result.right.length, 1);
        } else {
          assert.equal(result.right.length, 0);
        }
      });
    }

    test('reminder cooldown', async ({ bus }) => {
      const payer = await bus.exec(createPayerProfileFromEmailIdentity, {
        id: emailIdentity('test@test.test'),
        name: 'Teppo Testaaja',
      });

      assert.ok(payer);

      const center = await bus.exec(createDebtCenter, {
        name: 'Test Center',
        accountingPeriod: 2024,
        description: 'Desc',
        url: 'https://google.com/',
      });

      const component = await bus.exec(defs.createDebtComponent, {
        debtCenterId: center.id,
        name: 'Test Component',
        amount: euro(10),
        description: 'Test',
      });

      const debt = await bus.exec(defs.createDebt, {
        debt: {
          name: 'Name',
          description: 'Desc',
          centerId: center.id,
          accountingPeriod: 2024 as any,
          components: [component.id],
          payer: payer.id,
          dueDate: dateToDbDateString(subDays(new Date(), 1)),
          tags: [],
        },
      });

      await bus.exec(defs.publishDebt, debt.id);

      const result1 = await bus.exec(defs.sendAllReminders, {
        draft: false,
        ignoreReminderCooldown: false,
        debts: [debt.id],
      });

      assert.equal(result1.right.length, 1);

      const result2 = await bus.exec(defs.sendAllReminders, {
        draft: false,
        ignoreReminderCooldown: false,
        debts: [debt.id],
      });

      assert.equal(result2.right.length, 0);
    });
  });

  test('marking as paid by the debor', async ({ bus }) => {
    const payer = await bus.exec(createPayerProfileFromEmailIdentity, {
      id: emailIdentity('test@test.test'),
      name: 'Teppo Testaaja',
    });

    assert.ok(payer);

    const center = await bus.exec(createDebtCenter, {
      name: 'Test Center',
      accountingPeriod: 2024,
      description: 'Desc',
      url: 'https://google.com/',
    });

    const component = await bus.exec(defs.createDebtComponent, {
      debtCenterId: center.id,
      name: 'Test Component',
      amount: euro(10),
      description: 'Test',
    });

    const debt = await bus.exec(defs.createDebt, {
      debt: {
        name: 'Name',
        description: 'Desc',
        centerId: center.id,
        accountingPeriod: 2024 as any,
        components: [component.id],
        payer: payer.id,
        paymentCondition: 14,
        tags: [],
      },
    });

    await bus.exec(defs.publishDebt, debt.id);

    const assertMark = async (marked: boolean) => {
      const debt1 = await bus.exec(defs.getDebt, debt.id);
      assert.ok(debt1);

      if (marked) {
        assert.notEqual(debt1.markedAsPaid, null);
      } else {
        assert.equal(debt1.markedAsPaid, null);
      }
    };

    await assertMark(false);
    await bus.exec(defs.markAsPaid, { debtId: debt.id, paid: false });
    await assertMark(false);
    await bus.exec(defs.markAsPaid, { debtId: debt.id, paid: true });
    await assertMark(true);
    await bus.exec(defs.markAsPaid, { debtId: debt.id, paid: true });
    await assertMark(true);
    await bus.exec(defs.markAsPaid, { debtId: debt.id, paid: false });
    await assertMark(false);
  });
});
