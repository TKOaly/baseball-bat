import { createTestFunc, uuidValidator } from '../common';
import { expect, mockObject } from 'earl';
import { faker } from '@faker-js/faker';
import { TestHelper } from '../helper';
import { DebtService } from '../../src/services/debt';
import { euro } from '@bbat/common/currency';
import { DebtCentersService } from '../../src/services/debt_centers';
import { format, addDays, isSameDay, isToday, subDays } from 'date-fns';
import { EmailService, IEmailTransport } from '../../src/services/email';
import { JobService } from '../../src/services/jobs';
import { PgClient } from '../../src/db';
import { PaymentService } from '../../src/services/payements';
import { Config } from '../../src/config';

const test = createTestFunc();

test('Creating debt', async t => {
  const { container } = t.context;

  const debts = container.get(DebtService);
  const centers = container.get(DebtCentersService);
  const helper = container.get(TestHelper);

  const payer = await helper.createPayer();

  const debtCenterOpts = {
    name: faker.lorem.words(4),
    description: faker.lorem.words(15),
    url: faker.internet.url(),
    accountingPeriod: 2024,
  };

  const center = await centers.createDebtCenter(debtCenterOpts);

  if (center === null) {
    t.fail();

    return;
  }

  const componentOpts = {
    name: faker.lorem.words(3),
    amount: euro(10),
    description: faker.lorem.words(10),
    debtCenterId: center.id,
  };

  const component = await debts.createDebtComponent(componentOpts);

  const debtOpts = {
    name: faker.lorem.word(4),
    description: faker.lorem.word(10),
    components: [component.id],
    accountingPeriod: 2024,
    payer: payer.id,
    dueDate: null,
    paymentCondition: 14,
    tags: [],
    centerId: center.id,
  };

  const debt = await debts.createDebt(debtOpts);

  expect(debt).toEqual(
    expect.subset({
      id: uuidValidator(),
      name: debtOpts.name,
      description: debtOpts.description,
      accountingPeriod: debtOpts.accountingPeriod,
      payerId: debtOpts.payer,
      paymentCondition: debtOpts.paymentCondition,
      dueDate: null,
      tags: [],
      debtCenterId: debtOpts.centerId,
      createdAt: expect.a(Date),
      updatedAt: expect.a(Date),
      humanId: expect.regex(/DEBT-[0-9]{4}-[0-9]{4}/),
      date: null,
      draft: true,
      status: 'unpaid',
      credited: false,
      defaultPayment: null,
      publishedAt: null,
      lastReminded: null,
      debtComponents: expect.length(1),
    }),
  );

  expect(debt.debtComponents).toInclude(
    expect.subset({
      id: component.id,
    }),
  );
});

test('Publishing debt with payment condition', async t => {
  const { container } = t.context;

  const emailMock = mockObject<IEmailTransport>({
    sendEmail: () => Promise.resolve(),
  });

  container.set(
    EmailService,
    new EmailService(
      emailMock,
      container.get(PgClient),
      container.get(JobService),
      container.get(Config),
    ),
  );

  const debts = container.get(DebtService);
  const centers = container.get(DebtCentersService);
  const helper = container.get(TestHelper);

  const payer = await helper.createPayer();

  const debtCenterOpts = {
    name: faker.lorem.words(4),
    description: faker.lorem.words(15),
    url: faker.internet.url(),
    accountingPeriod: 2024,
  };

  const center = await centers.createDebtCenter(debtCenterOpts);

  if (center === null) {
    t.fail();

    return;
  }

  const componentOpts = {
    name: faker.lorem.words(3),
    amount: euro(10),
    description: faker.lorem.words(10),
    debtCenterId: center.id,
  };

  const component = await debts.createDebtComponent(componentOpts);

  const debtOpts = {
    name: faker.lorem.word(4),
    description: faker.lorem.word(10),
    components: [component.id],
    accountingPeriod: 2024,
    payer: payer.id,
    dueDate: null,
    paymentCondition: 14,
    tags: [],
    centerId: center.id,
  };

  let debt = await debts.createDebt(debtOpts);

  expect(debt).toEqual(
    expect.subset({
      draft: true,
      date: expect.nullish(),
      publishedAt: expect.nullish(),
    }),
  );

  await debts.publishDebt(debt.id);

  debt = (await debts.getDebt(debt.id))!;

  expect(debt).toEqual(
    expect.subset({
      draft: false,
      date: expect.satisfies(value => value instanceof Date && isToday(value)),
      publishedAt: expect.satisfies(
        value => value instanceof Date && isToday(value),
      ),
      dueDate: expect.satisfies(
        value =>
          value instanceof Date &&
          isSameDay(value, addDays(new Date(), debtOpts.paymentCondition)),
      ),
    }),
  );
});

test('Reminders should not be sent for draft debts', async t => {
  const { container } = t.context;

  const emailMock = mockObject<IEmailTransport>({
    sendEmail: () => Promise.resolve(),
  });

  container.set(
    EmailService,
    new EmailService(
      emailMock,
      container.get(PgClient),
      container.get(JobService),
      container.get(Config),
    ),
  );

  const debts = container.get(DebtService);
  const centers = container.get(DebtCentersService);
  const helper = container.get(TestHelper);

  const payer = await helper.createPayer();

  const debtCenterOpts = {
    name: faker.lorem.words(4),
    description: faker.lorem.words(15),
    url: faker.internet.url(),
    accountingPeriod: 2024,
  };

  const center = await centers.createDebtCenter(debtCenterOpts);

  if (center === null) {
    t.fail();

    return;
  }

  const componentOpts = {
    name: faker.lorem.words(3),
    amount: euro(10),
    description: faker.lorem.words(10),
    debtCenterId: center.id,
  };

  const component = await debts.createDebtComponent(componentOpts);

  const debtOpts = {
    name: faker.lorem.word(4),
    description: faker.lorem.word(10),
    components: [component.id],
    accountingPeriod: 2024,
    payer: payer.id,
    dueDate: null,
    paymentCondition: 14,
    tags: [],
    centerId: center.id,
  };

  await debts.createDebt(debtOpts);

  await debts.sendAllReminders(false, false);

  expect(emailMock.sendEmail).toHaveBeenCalledTimes(0);
});

test('Emails should be sent for published debts', async t => {
  const { container } = t.context;

  //const realEmailService = container.get(EmailService);
  //const mockedEmailService = spy(realEmailService);

  //container.set(EmailService, realEmailService);

  const debts = container.get(DebtService);
  const centers = container.get(DebtCentersService);
  const emails = container.get(EmailService);
  const helper = container.get(TestHelper);

  const payer = await helper.createPayer();

  const debtCenterOpts = {
    name: faker.lorem.words(4),
    description: faker.lorem.words(15),
    url: faker.internet.url(),
    accountingPeriod: 2024,
  };

  const center = await centers.createDebtCenter(debtCenterOpts);

  if (center === null) {
    t.fail();

    return;
  }

  const componentOpts = {
    name: faker.lorem.words(3),
    amount: euro(10),
    description: faker.lorem.words(10),
    debtCenterId: center.id,
  };

  const component = await debts.createDebtComponent(componentOpts);

  const debtOpts = {
    name: faker.lorem.word(4),
    description: faker.lorem.word(10),
    components: [component.id],
    accountingPeriod: 2024,
    payer: payer.id,
    dueDate: format(subDays(new Date(), 30), 'yyyy-MM-dd') as any,
    paymentCondition: null,
    tags: [],
    centerId: center.id,
  };

  let debt = await debts.createDebt(debtOpts);

  const unpublishedDebtOpts = {
    name: faker.lorem.word(4),
    description: faker.lorem.word(10),
    components: [component.id],
    accountingPeriod: 2024,
    payer: payer.id,
    dueDate: format(subDays(new Date(), 30), 'yyyy-MM-dd') as any,
    paymentCondition: null,
    tags: [],
    centerId: center.id,
  };

  await debts.createDebt(unpublishedDebtOpts);

  await debts.publishDebt(debt.id);

  debt = (await debts.getDebt(debt.id))!;

  const overdue = await debts.getOverdueDebts();

  expect(overdue).toHaveLength(1);

  await debts.sendAllReminders(false, true);

  const debtEmails = await emails.getEmailsByDebt(debt.id);

  expect(debtEmails).toHaveLength(2);

  expect(debtEmails).toEqual(
    expect.includes(
      expect.subset({
        subject: expect.includes('Payment Notice'),
        text: expect.includes('10,00'),
      }),
    ),
  );

  expect(debtEmails).toEqual(
    expect.includes(
      expect.subset({
        subject: expect.includes('Invoice'),
        text: expect.includes('10,00'),
      }),
    ),
  );
});

test('Reminders should only be sent for unpaid and published debts', async t => {
  const { container } = t.context;

  const debts = container.get(DebtService);
  const centers = container.get(DebtCentersService);
  const payments = container.get(PaymentService);
  const emails = container.get(EmailService);
  const helper = container.get(TestHelper);

  const payer = await helper.createPayer();

  const debtCenterOpts = {
    name: faker.lorem.words(4),
    description: faker.lorem.words(15),
    url: faker.internet.url(),
    accountingPeriod: 2024,
  };

  const center = await centers.createDebtCenter(debtCenterOpts);

  if (center === null) {
    t.fail();

    return;
  }

  const componentOpts = {
    name: faker.lorem.words(3),
    amount: euro(10),
    description: faker.lorem.words(10),
    debtCenterId: center.id,
  };

  const component = await debts.createDebtComponent(componentOpts);

  const debtOpts = {
    name: 'Published Debt',
    description: faker.lorem.word(10),
    components: [component.id],
    accountingPeriod: 2024,
    payer: payer.id,
    dueDate: format(subDays(new Date(), 30), 'yyyy-MM-dd') as any,
    paymentCondition: null,
    tags: [],
    centerId: center.id,
  };

  const debt = await debts.createDebt(debtOpts);

  await debts.publishDebt(debt.id);

  const unpublishedDebtOpts = {
    name: 'Unpublished Debt',
    description: faker.lorem.word(10),
    components: [component.id],
    accountingPeriod: 2024,
    payer: payer.id,
    dueDate: format(subDays(new Date(), 30), 'yyyy-MM-dd') as any,
    paymentCondition: null,
    tags: [],
    centerId: center.id,
  };

  await debts.createDebt(unpublishedDebtOpts);

  const paidDebtOpts = {
    name: 'Paid Debt',
    description: faker.lorem.word(10),
    components: [component.id],
    accountingPeriod: 2024,
    payer: payer.id,
    dueDate: format(subDays(new Date(), 30), 'yyyy-MM-dd') as any,
    paymentCondition: null,
    tags: [],
    centerId: center.id,
  };

  const paidDebt = await debts.createDebt(paidDebtOpts);
  await debts.publishDebt(paidDebt.id);
  const debtPayments = await payments.getPaymentsContainingDebt(paidDebt.id);

  expect(debtPayments).toHaveLength(1);
  let payment = debtPayments[0];

  await payments.createPaymentEvent(payment.id, {
    amount: euro(10),
    type: 'payment',
  });

  payment = (await payments.getPayment(payment.id))!;

  expect(payment.events).toHaveLength(2);
  expect(payment.events).toEqual(
    expect.includes(
      expect.subset({
        type: 'created',
        amount: euro(-10),
      }),
    ),
  );
  expect(payment.events).toEqual(
    expect.includes(
      expect.subset({
        type: 'payment',
        amount: euro(10),
      }),
    ),
  );
  expect(payment.status).toEqual('paid');

  const afterPaid = await debts.getDebt(paidDebt.id);
  expect(afterPaid?.status).toEqual('paid');

  const creditedDebtOpts = {
    name: 'Credited Debt',
    description: faker.lorem.word(10),
    components: [component.id],
    accountingPeriod: 2024,
    payer: payer.id,
    dueDate: format(subDays(new Date(), 30), 'yyyy-MM-dd') as any,
    paymentCondition: null,
    tags: [],
    centerId: center.id,
  };

  const creditedDebt = await debts.createDebt(creditedDebtOpts);
  await debts.publishDebt(creditedDebt.id);
  await debts.creditDebt(creditedDebt.id);

  const { messageCount, payerCount, errors } =
    await debts.sendPaymentRemindersByPayer(payer.id, {
      send: true,
      ignoreCooldown: true,
    });

  expect(messageCount).toEqual(1);
  expect(payerCount).toEqual(1);
  expect(errors).toHaveLength(0);

  const e = await emails.getEmails();

  expect(e).toHaveLength(4);

  expect(e).toEqual(
    expect.includes(
      expect.subset({
        subject: '[Maksumuistutus / Payment Notice] Published Debt',
      }),
    ),
  );
});

test('Emails should not be sent for backdated debts when publishing', async t => {
  const { container } = t.context;

  const debts = container.get(DebtService);
  const centers = container.get(DebtCentersService);
  const helper = container.get(TestHelper);
  const emails = container.get(EmailService);

  const payer = await helper.createPayer();

  const debtCenterOpts = {
    name: faker.lorem.words(4),
    description: faker.lorem.words(15),
    url: faker.internet.url(),
    accountingPeriod: 2024,
  };

  const center = await centers.createDebtCenter(debtCenterOpts);

  if (center === null) {
    t.fail();

    return;
  }

  const componentOpts = {
    name: faker.lorem.words(3),
    amount: euro(10),
    description: faker.lorem.words(10),
    debtCenterId: center.id,
  };

  const component = await debts.createDebtComponent(componentOpts);

  const debtOpts = {
    name: faker.lorem.word(4),
    description: faker.lorem.word(10),
    components: [component.id],
    accountingPeriod: 2024,
    payer: payer.id,
    date: format(subDays(new Date(), 2), 'yyyy-MM-dd') as any,
    dueDate: format(subDays(new Date(), 1), 'yyyy-MM-dd') as any,
    paymentCondition: null,
    tags: [],
    centerId: center.id,
  };

  const debt = await debts.createDebt(debtOpts);
  await debts.publishDebt(debt.id);

  const e = await emails.getEmails();

  expect(e).toHaveLength(0);

  const d = await debts.getDebt(debt.id);

  if (d === null) {
    t.fail();
    return;
  }

  await debts.sendReminder(d);

  const e2 = await emails.getEmails();

  expect(e2).toHaveLength(1);

  expect(e2).toEqual([
    expect.subset({
      subject: expect.includes(
        `[Maksumuistutus / Payment Notice] ${debt.name}`,
      ),
    }),
  ]);
});
