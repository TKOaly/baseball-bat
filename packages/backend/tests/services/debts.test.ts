import setup from '../setup';
import * as defs from '../../src/services/debts/definitions';
import assert from 'node:assert';
import { createDebtCenter } from '../../src/services/debt-centers/definitions';
import { createPayerProfileFromEmailIdentity } from '../../src/services/payers/definitions';
import { emailIdentity, euro } from '@bbat/common/src/types';
import { getEmails } from '../../src/services/email/definitions';
import { createPaymentEvent } from '@/services/payments/definitions';

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

    const emails = await bus.exec(getEmails);

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

    const emails = await bus.exec(getEmails);

    assert.equal(emails.length, 1);
    // FIXME: Should send credited email!
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
});
