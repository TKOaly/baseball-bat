import 'reflect-metadata';
import { DebtCentersService } from '../../src/services/debt_centers';
import * as uuid from 'uuid';
import { isLeft, isRight } from 'fp-ts/lib/Either';
import { createTestFunc } from '../common';

const test = createTestFunc();

test('Debt center creation works', async t => {
  const centers = t.context.container.get(DebtCentersService);

  const newCenter = {
    name: 'Test Center',
    url: 'https://example.com/',
    description: '',
    accountingPeriod: 2023,
  };

  const createdCenter = await centers.createDebtCenter(newCenter);

  if (createdCenter === null) {
    t.fail();

    return;
  }

  t.like(createdCenter, newCenter);

  const centerList = await centers.getDebtCenters();

  t.is(centerList.length, 1);

  t.like(centerList[0], newCenter);
  t.is(centerList[0].id, createdCenter.id);
});

test('Debt center deletion works', async t => {
  const centers = t.context.container.get(DebtCentersService);

  let centerList = await centers.getDebtCenters();
  t.is(centerList.length, 0);

  const newCenter = {
    name: 'Test Center',
    url: 'https://example.com/',
    description: '',
    accountingPeriod: 2023,
  };

  const createdCenter = await centers.createDebtCenter(newCenter);

  if (createdCenter === null) {
    t.fail();

    return;
  }

  centerList = await centers.getDebtCenters();
  t.is(centerList.length, 1);

  await centers.deleteDebtCenter(createdCenter.id);

  centerList = await centers.getDebtCenters();
  t.is(centerList.length, 0);
});

test('Querying debt center by name works', async t => {
  const centers = t.context.container.get(DebtCentersService);

  const centerList = await centers.getDebtCenters();
  t.is(centerList.length, 0);

  const newCenter = {
    name: 'Test Center',
    url: 'https://example.com/',
    description: '',
    accountingPeriod: 2023,
  };

  const createdCenter = await centers.createDebtCenter(newCenter);

  if (createdCenter === null) {
    t.fail();

    return;
  }

  const result = await centers.getDebtCenterByName('Test Center');
  t.deepEqual(createdCenter, result);
});

test('Querying debt center by id works', async t => {
  const centers = t.context.container.get(DebtCentersService);

  const centerList = await centers.getDebtCenters();
  t.is(centerList.length, 0);

  const newCenter = {
    name: 'Test Center',
    url: 'https://example.com/',
    description: '',
    accountingPeriod: 2023,
  };

  const createdCenter = await centers.createDebtCenter(newCenter);

  if (createdCenter === null) {
    t.fail();

    return;
  }

  const result = await centers.getDebtCenter(createdCenter.id);
  t.deepEqual(createdCenter, result);
});

test('Updating debt center works', async t => {
  const centers = t.context.container.get(DebtCentersService);

  const centerList = await centers.getDebtCenters();
  t.is(centerList.length, 0);

  const newCenter = {
    name: 'Test Center',
    url: 'https://example.com/',
    description: '',
    accountingPeriod: 2023,
  };

  const createdCenter = await centers.createDebtCenter(newCenter);

  if (createdCenter === null) {
    t.fail();

    return;
  }

  const updateValues = {
    name: 'Updated Name',
    url: 'https://example.com/#updated',
    description: 'Updated Description',
  };

  const result = await centers.updateDebtCenter({
    id: createdCenter.id,
    ...updateValues,
  });

  t.true(isRight(result));

  const queried = await centers.getDebtCenter(createdCenter.id);
  t.like(queried, updateValues);
});

test('Updating debt center fails for non-existent id', async t => {
  const centers = t.context.container.get(DebtCentersService);

  const updateValues = {
    name: 'Updated Name',
    url: 'https://example.com/#updated',
    description: 'Updated Description',
  };

  const result = await centers.updateDebtCenter({
    id: uuid.v4(),
    ...updateValues,
  });

  t.true(isLeft(result));
});
