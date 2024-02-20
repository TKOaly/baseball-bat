import setup from '../setup';
import assert from 'node:assert';
import * as defs from '../../src/services/payments/definitions';
import { euro } from '@bbat/common/src/currency';

setup('Payments service', ({ test }) => {
  test('creating cash payment', async ({ bus }) => {
    const result = await bus.exec(defs.createPayment, {
      payment: {
        type: 'cash',
        message: 'Test',
        title: 'Test',
        amount: euro(10),
        data: {},
      },
    });

    assert.equal(result.title, 'Test');
    assert.equal(result.type, 'cash');
    assert.equal(result.message, 'Test');
    assert.deepEqual(result.data, {});
    assert.deepEqual(result.balance, euro(-10));
  });

  test('creating invoice payment', async ({ bus }) => {
    const result = await bus.exec(defs.createPayment, {
      payment: {
        type: 'invoice',
        message: 'Test',
        title: 'Test',
        amount: euro(10),
        data: {},
      },
    });

    assert.equal(result.title, 'Test');
    assert.equal(result.type, 'invoice');
    assert.equal(result.message, 'Test');
    assert.ok(result.data);
    assert.ok('due_date' in result.data);
    assert.ok('date' in result.data);
    assert.ok('reference_number' in result.data);
    assert.deepEqual(result.balance, euro(-10));
  });

  test('listing payments without any', async ({ bus }) => {
    const result = await bus.exec(defs.getPayments);
    assert.equal(result.length, 0);
  });

  test('payment balance arithmetic', async ({ bus }) => {
    const original = await bus.exec(defs.createPayment, {
      payment: {
        type: 'invoice',
        message: 'Test',
        title: 'Test',
        data: {},
        amount: euro(10),
      },
    });

    await bus.exec(defs.createPaymentEvent, {
      paymentId: original.id,
      type: 'payment',
      amount: euro(5),
      transaction: null,
    });

    const payment = await bus.exec(defs.getPayment, original.id);

    assert.ok(payment);

    assert.equal(payment.id, original.id);
    assert.deepEqual(payment.balance, euro(-5));
  });

  test('payment status change', async ({ bus, t }) => {
    const handler = t.mock.fn();
    bus.on(defs.onStatusChanged, handler);

    const payment = await bus.exec(defs.createPayment, {
      payment: {
        type: 'invoice',
        message: 'Test',
        title: 'Test',
        data: {},
        amount: euro(10),
      },
    });

    await bus.exec(defs.createPaymentEvent, {
      paymentId: payment.id,
      type: 'payment',
      amount: euro(5),
      transaction: null,
    });

    assert.equal(handler.mock.calls.length, 1);
    assert.deepEqual(handler.mock.calls[0].arguments[0], {
      paymentId: payment.id,
      status: 'mispaid',
    });

    await bus.exec(defs.createPaymentEvent, {
      paymentId: payment.id,
      type: 'payment',
      amount: euro(5),
      transaction: null,
    });

    assert.equal(handler.mock.calls.length, 2);
    assert.deepEqual(handler.mock.calls[1].arguments[0], {
      paymentId: payment.id,
      status: 'paid',
    });

    await bus.exec(defs.createPaymentEvent, {
      paymentId: payment.id,
      type: 'payment',
      amount: euro(5),
      transaction: null,
    });

    assert.equal(handler.mock.calls.length, 3);
    assert.deepEqual(handler.mock.calls[2].arguments[0], {
      paymentId: payment.id,
      status: 'mispaid',
    });
  });

  test('payment balance change', async ({ bus, t }) => {
    const handler = t.mock.fn();
    bus.on(defs.onBalanceChanged, handler);

    const payment = await bus.exec(defs.createPayment, {
      payment: {
        type: 'invoice',
        message: 'Test',
        title: 'Test',
        data: {},
        amount: euro(10),
      },
    });

    await bus.exec(defs.createPaymentEvent, {
      paymentId: payment.id,
      type: 'payment',
      amount: euro(5),
      transaction: null,
    });

    assert.equal(handler.mock.calls.length, 1);
    assert.deepEqual(handler.mock.calls[0].arguments[0], {
      paymentId: payment.id,
      balance: euro(-5),
    });

    await bus.exec(defs.createPaymentEvent, {
      paymentId: payment.id,
      type: 'payment',
      amount: euro(5),
      transaction: null,
    });

    assert.equal(handler.mock.calls.length, 2);
    assert.deepEqual(handler.mock.calls[1].arguments[0], {
      paymentId: payment.id,
      balance: euro(0),
    });

    await bus.exec(defs.createPaymentEvent, {
      paymentId: payment.id,
      type: 'payment',
      amount: euro(5),
      transaction: null,
    });

    assert.equal(handler.mock.calls.length, 3);
    assert.deepEqual(handler.mock.calls[2].arguments[0], {
      paymentId: payment.id,
      balance: euro(5),
    });
  });

  /*test('crediting payment', async ({ bus, t }) => {
    const handler = t.mock.fn();
    bus.on(defs.onBalanceChanged, handler);

    const payment = await bus.exec(defs.createPayment, {
      payment: {
        type: 'invoice',
        message: 'Test',
        title: 'Test',
        data: {},
        amount: euro(10),
      },
    });

    assert.ok(payment);

    await bus.exec(defs.creditPayment, {
      id: payment.id,
      reason: 'Message!',
    });

    const newPayment = await bus.exec(defs.getPayment, payment.id);

    assert.ok(newPayment);
    assert.equal(newPayment.id, payment.id);
    assert.ok(newPayment.credited);
  });*/
});
