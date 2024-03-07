import setup from './setup';
import assert from 'node:assert';
import * as defs from '@/modules/banking/definitions';
import { describe } from 'node:test';
import { parseCamtStatement } from '@bbat/common/camt-parser';
import { formatISO } from 'date-fns';
import { euro } from '@bbat/common/currency';
import * as payments from '@/modules/payments/definitions';

const GROUPED_IBAN = 'FI79 9359 4446 8357 68';
const IBAN = GROUPED_IBAN.replaceAll(' ', '');

setup('Banking service', ({ test }) => {
  test('creating bank account', async ({ bus }) => {
    await bus.exec(defs.createBankAccount, {
      name: 'Test Account',
      iban: GROUPED_IBAN,
    });

    const result = await bus.exec(defs.getBankAccounts);

    assert.equal(result.length, 1);
    assert.equal(result[0].name, 'Test Account');
    assert.equal(result[0].iban, IBAN);
  });

  test('parsing bank statement', async ({ readFixture }) => {
    const camt = await readFixture('camt/single-payment.xml');
    const statement = await parseCamtStatement(camt);

    assert.equal(statement.id, '721d579e6fed739950fc4f50148e1c81');
    assert.equal(formatISO(statement.creationDateTime), '2024-02-01T17:45:27Z');
    assert.equal(statement.account.iban, IBAN);
    assert.equal(statement.account.currency, 'EUR');
    assert.equal(statement.servicer.name, 'Holvi Payment Services Oy');
    assert.equal(statement.servicer.bic, 'HOLVFIHH');
    assert.equal(
      statement.servicer.postalAddress,
      'Kaikukatu 2 C, 00530 Helsinki',
    );
    assert.deepEqual(
      formatISO(statement.openingBalance.date),
      '2024-01-01T00:00:00Z',
    );
    assert.deepEqual(statement.openingBalance.amount, euro(0));
    assert.deepEqual(
      formatISO(statement.closingBalance.date),
      '2024-01-31T00:00:00Z',
    );
    assert.deepEqual(statement.closingBalance.amount, euro(10));
    assert.equal(statement.entries.length, 1);
    assert.deepEqual(statement.entries[0].amount, euro(10));
    assert.equal(statement.entries[0].message, null);
    assert.equal(
      formatISO(statement.entries[0].valueDate),
      '2024-01-02T00:00:00Z',
    );
    assert.equal(statement.entries[0].type, 'credit');
    assert.equal(statement.entries[0].otherParty.name, 'TEPPO TESTAAJA');
    assert.equal(statement.entries[0].id, 'dc2705347c720a4bc1484cf99671a499');
    assert.equal(statement.entries[0].reference, 'RF4974154318938921639933');
  });

  test('import statement for unknown account should fail', async ({
    bus,
    readFixture,
  }) => {
    const camt = await readFixture('camt/single-payment.xml');
    const statement = await parseCamtStatement(camt);

    await assert.rejects(
      bus.exec(defs.createBankStatement, {
        id: statement.id,
        accountIban: statement.account.iban,
        generatedAt: statement.creationDateTime,
        transactions: statement.entries.map(entry => ({
          id: entry.id,
          amount: entry.amount,
          date: entry.valueDate,
          type: entry.type,
          otherParty: entry.otherParty,
          message: entry.message,
          reference: entry.reference,
        })),
        openingBalance: statement.openingBalance,
        closingBalance: statement.closingBalance,
      }),
    );
  });

  test('import statement from file', async ({
    bus,
    readFixture,
    mockEvent,
  }) => {
    const camt = await readFixture('camt/single-payment.xml');
    const statement = await parseCamtStatement(camt);
    const txSpy = await mockEvent(defs.onTransaction);

    await bus.exec(defs.createBankAccount, {
      name: 'Test Account',
      iban: statement.account.iban,
    });

    const result = await bus.exec(defs.createBankStatement, {
      id: statement.id,
      accountIban: statement.account.iban,
      generatedAt: statement.creationDateTime,
      transactions: statement.entries.map(entry => ({
        id: entry.id,
        amount: entry.amount,
        date: entry.valueDate,
        type: entry.type,
        otherParty: entry.otherParty,
        message: entry.message,
        reference: entry.reference,
      })),
      openingBalance: statement.openingBalance,
      closingBalance: statement.closingBalance,
    });

    assert.ok(result);
    assert.equal(result.statement.id, '721d579e6fed739950fc4f50148e1c81');
    assert.equal(
      formatISO(result.statement.generatedAt),
      '2024-02-01T17:45:27Z',
    );
    assert.equal(result.statement.accountIban, IBAN);
    assert.deepEqual(
      formatISO(result.statement.openingBalance.date),
      '2024-01-01T00:00:00Z',
    );
    assert.deepEqual(result.statement.openingBalance.amount, euro(0));
    assert.deepEqual(
      formatISO(result.statement.closingBalance.date),
      '2024-01-31T00:00:00Z',
    );
    assert.deepEqual(result.statement.closingBalance.amount, euro(10));
    assert.equal(result.transactions.length, 1);
    assert.deepEqual(result.transactions[0].amount, euro(10));
    assert.equal(result.transactions[0].message, null);
    assert.equal(
      formatISO(result.transactions[0].date),
      '2024-01-02T00:00:00Z',
    );
    assert.equal(result.transactions[0].type, 'credit');
    assert.equal(result.transactions[0].otherParty?.name, 'TEPPO TESTAAJA');
    assert.equal(result.transactions[0].id, 'dc2705347c720a4bc1484cf99671a499');
    assert.equal(result.transactions[0].reference, 'RF4974154318938921639933');

    assert.equal(txSpy.calls.length, 1);
    assert.equal(
      (txSpy.calls[0].arguments[0] as any).id,
      'dc2705347c720a4bc1484cf99671a499',
    );
  });

  test('importing statement should create payment events', async ({
    bus,
    readFixture,
    mockEvent,
  }) => {
    const camt = await readFixture('camt/single-payment.xml');
    const statement = await parseCamtStatement(camt);

    const statusSpy = await mockEvent(payments.onStatusChanged);
    const balanceSpy = await mockEvent(payments.onBalanceChanged);

    const result = await bus.exec(payments.createPayment, {
      payment: {
        type: 'invoice',
        message: 'Test Message',
        title: 'Test Title',
        data: {},
        amount: euro(10),
      },
      options: {
        referenceNumber: 'RF4974154318938921639933',
        ads: 123,
      },
    });

    await bus.exec(defs.createBankAccount, {
      name: 'Test Account',
      iban: statement.account.iban,
    });

    await bus.exec(defs.createBankStatement, {
      id: statement.id,
      accountIban: statement.account.iban,
      generatedAt: statement.creationDateTime,
      transactions: statement.entries.map(entry => ({
        id: entry.id,
        amount: entry.amount,
        date: entry.valueDate,
        type: entry.type,
        otherParty: entry.otherParty,
        message: entry.message,
        reference: entry.reference,
      })),
      openingBalance: statement.openingBalance,
      closingBalance: statement.closingBalance,
    });

    assert.equal(balanceSpy.calls.length, 1);
    assert.deepEqual(balanceSpy.calls[0].arguments[0], {
      paymentId: result.id,
      balance: euro(0),
    });
    assert.equal(statusSpy.calls.length, 1);
    assert.deepEqual(statusSpy.calls[0].arguments[0], {
      paymentId: result.id,
      status: 'paid',
    });
  });

  test('importing overlapping statements', async ({
    bus,
    readFixture,
    mockEvent,
  }) => {
    const txSpy = await mockEvent(defs.onTransaction);

    const camt1 = await readFixture('camt/single-payment.xml');
    const statement1 = await parseCamtStatement(camt1);

    const camt2 = await readFixture('camt/two-payments.xml');
    const statement2 = await parseCamtStatement(camt2);

    await bus.exec(defs.createBankAccount, {
      name: 'Test Account',
      iban: statement1.account.iban,
    });

    await bus.exec(defs.createBankStatement, {
      id: statement1.id,
      accountIban: statement1.account.iban,
      generatedAt: statement1.creationDateTime,
      transactions: statement1.entries.map(entry => ({
        id: entry.id,
        amount: entry.amount,
        date: entry.valueDate,
        type: entry.type,
        otherParty: entry.otherParty,
        message: entry.message,
        reference: entry.reference,
      })),
      openingBalance: statement1.openingBalance,
      closingBalance: statement1.closingBalance,
    });

    await bus.exec(defs.createBankStatement, {
      id: statement2.id,
      accountIban: statement2.account.iban,
      generatedAt: statement2.creationDateTime,
      transactions: statement2.entries.map(entry => ({
        id: entry.id,
        amount: entry.amount,
        date: entry.valueDate,
        type: entry.type,
        otherParty: entry.otherParty,
        message: entry.message,
        reference: entry.reference,
      })),
      openingBalance: statement2.openingBalance,
      closingBalance: statement2.closingBalance,
    });

    const transactions1 = await bus.exec(defs.getBankStatementTransactions, {
      id: statement1.id,
    });
    assert.equal(transactions1.result.length, 1);

    const transactions2 = await bus.exec(defs.getBankStatementTransactions, {
      id: statement2.id,
    });
    assert.equal(transactions2.result.length, 2);

    const accountTransactions = await bus.exec(defs.getAccountTransactions, {
      iban: IBAN,
    });
    assert.equal(accountTransactions.result.length, 2);

    assert.equal(txSpy.calls.length, 2);
  });

  describe('registrations', () => {
    test('registrations cannot exceed the amount of the transaction', async ({
      bus,
      readFixture,
    }) => {
      await bus.exec(defs.createBankAccount, {
        name: 'Test Account',
        iban: GROUPED_IBAN,
      });

      const payment1 = await bus.exec(payments.createPayment, {
        payment: {
          type: 'invoice',
          title: 'Test 1',
          message: 'Test 1 Desc.',
          data: {},
          amount: euro(10),
        },
        options: {},
      });

      const payment2 = await bus.exec(payments.createPayment, {
        payment: {
          type: 'invoice',
          title: 'Test 2',
          message: 'Test 2 Desc.',
          data: {},
          amount: euro(5),
        },
        options: {},
      });

      const camt = await readFixture('camt/single-payment.xml');
      const statement = await parseCamtStatement(camt);

      const stmt = await bus.exec(defs.createBankStatement, {
        id: statement.id,
        accountIban: statement.account.iban,
        generatedAt: statement.creationDateTime,
        transactions: statement.entries.map(entry => ({
          id: entry.id,
          amount: entry.amount,
          date: entry.valueDate,
          type: entry.type,
          otherParty: entry.otherParty,
          message: entry.message,
          reference: entry.reference,
        })),
        openingBalance: statement.openingBalance,
        closingBalance: statement.closingBalance,
      });

      await bus.exec(payments.createPaymentEventFromTransaction, {
        transaction: stmt.transactions[0],
        amount: euro(5),
        paymentId: payment1.id,
      });

      await assert.rejects(
        bus.exec(payments.createPaymentEventFromTransaction, {
          transaction: stmt.transactions[0],
          amount: euro(10),
          paymentId: payment2.id,
        }),
      );
    });

    test('single registration with exact amount should succeed', async ({
      bus,
      readFixture,
    }) => {
      await bus.exec(defs.createBankAccount, {
        name: 'Test Account',
        iban: GROUPED_IBAN,
      });

      const payment = await bus.exec(payments.createPayment, {
        payment: {
          type: 'invoice',
          title: 'Test 1',
          message: 'Test 1 Desc.',
          data: {},
          amount: euro(10),
        },
        options: {},
      });

      const camt = await readFixture('camt/single-payment.xml');
      const statement = await parseCamtStatement(camt);

      const stmt = await bus.exec(defs.createBankStatement, {
        id: statement.id,
        accountIban: statement.account.iban,
        generatedAt: statement.creationDateTime,
        transactions: statement.entries.map(entry => ({
          id: entry.id,
          amount: entry.amount,
          date: entry.valueDate,
          type: entry.type,
          otherParty: entry.otherParty,
          message: entry.message,
          reference: entry.reference,
        })),
        openingBalance: statement.openingBalance,
        closingBalance: statement.closingBalance,
      });

      await bus.exec(payments.createPaymentEventFromTransaction, {
        transaction: stmt.transactions[0],
        amount: euro(10),
        paymentId: payment.id,
      });

      const registrations = await bus.exec(
        defs.getTransactionRegistrations,
        stmt.transactions[0].id,
      );

      assert.equal(registrations.length, 1);
      assert.equal(registrations[0].paymentId, payment.id);
      assert.deepEqual(registrations[0].amount, euro(10));

      const paid = await bus.exec(payments.getPayment, payment.id);

      assert.ok(paid);
      assert.equal(paid.status, 'paid');
    });

    test('single registration with lesser amount should succeed', async ({
      bus,
      readFixture,
    }) => {
      await bus.exec(defs.createBankAccount, {
        name: 'Test Account',
        iban: GROUPED_IBAN,
      });

      const payment = await bus.exec(payments.createPayment, {
        payment: {
          type: 'invoice',
          title: 'Test 1',
          message: 'Test 1 Desc.',
          data: {},
          amount: euro(10),
        },
        options: {},
      });

      const camt = await readFixture('camt/single-payment.xml');
      const statement = await parseCamtStatement(camt);

      const stmt = await bus.exec(defs.createBankStatement, {
        id: statement.id,
        accountIban: statement.account.iban,
        generatedAt: statement.creationDateTime,
        transactions: statement.entries.map(entry => ({
          id: entry.id,
          amount: entry.amount,
          date: entry.valueDate,
          type: entry.type,
          otherParty: entry.otherParty,
          message: entry.message,
          reference: entry.reference,
        })),
        openingBalance: statement.openingBalance,
        closingBalance: statement.closingBalance,
      });

      await bus.exec(payments.createPaymentEventFromTransaction, {
        transaction: stmt.transactions[0],
        amount: euro(5),
        paymentId: payment.id,
      });

      const registrations = await bus.exec(
        defs.getTransactionRegistrations,
        stmt.transactions[0].id,
      );

      assert.equal(registrations.length, 1);
      assert.equal(registrations[0].paymentId, payment.id);
      assert.deepEqual(registrations[0].amount, euro(5));

      const paid = await bus.exec(payments.getPayment, payment.id);

      assert.ok(paid);
      assert.equal(paid.status, 'mispaid');
    });

    test('multiple registrations with an exact amount should succeed', async ({
      bus,
      readFixture,
    }) => {
      await bus.exec(defs.createBankAccount, {
        name: 'Test Account',
        iban: GROUPED_IBAN,
      });

      const payment1 = await bus.exec(payments.createPayment, {
        payment: {
          type: 'invoice',
          title: 'Test 1',
          message: 'Test 1 Desc.',
          data: {},
          amount: euro(10),
        },
        options: {},
      });

      const payment2 = await bus.exec(payments.createPayment, {
        payment: {
          type: 'invoice',
          title: 'Test 2',
          message: 'Test 2 Desc.',
          data: {},
          amount: euro(5),
        },
        options: {},
      });

      const camt = await readFixture('camt/single-payment.xml');
      const statement = await parseCamtStatement(camt);

      const stmt = await bus.exec(defs.createBankStatement, {
        id: statement.id,
        accountIban: statement.account.iban,
        generatedAt: statement.creationDateTime,
        transactions: statement.entries.map(entry => ({
          id: entry.id,
          amount: entry.amount,
          date: entry.valueDate,
          type: entry.type,
          otherParty: entry.otherParty,
          message: entry.message,
          reference: entry.reference,
        })),
        openingBalance: statement.openingBalance,
        closingBalance: statement.closingBalance,
      });

      await bus.exec(payments.createPaymentEventFromTransaction, {
        transaction: stmt.transactions[0],
        amount: euro(5),
        paymentId: payment1.id,
      });

      await bus.exec(payments.createPaymentEventFromTransaction, {
        transaction: stmt.transactions[0],
        amount: euro(5),
        paymentId: payment2.id,
      });

      const registrations = await bus.exec(
        defs.getTransactionRegistrations,
        stmt.transactions[0].id,
      );

      assert.equal(registrations.length, 2);

      const paid1 = await bus.exec(payments.getPayment, payment1.id);

      assert.ok(paid1);
      assert.equal(paid1.status, 'mispaid');

      const paid2 = await bus.exec(payments.getPayment, payment2.id);

      assert.ok(paid2);
      assert.equal(paid2.status, 'paid');
    });
  });
});
