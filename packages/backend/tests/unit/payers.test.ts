import { emailIdentity, tkoalyIdentity } from '@bbat/common/types';
import setup from './setup';
import * as defs from '@/modules/payers/definitions';
import { assert as chai, use as chaiUse } from 'chai';
import assert from 'node:assert';
import { getUpstreamUserById } from '@/modules/users/definitions';
import chaiSubset from 'chai-subset';

chaiUse(chaiSubset);

setup('Payers service', ({ test }) => {
  test('creating from email', async ({ bus }) => {
    const email = 'test@test.test';

    const created = await bus.exec(defs.createPayerProfileFromEmailIdentity, {
      id: emailIdentity(email),
      name: 'Teppo Testaaja',
    });

    assert.ok(created);
    assert.equal(created.emails.length, 1);
    assert.equal(created.emails[0].email, email);
    assert.equal(created.emails[0].priority, 'primary');
    assert.equal(created.emails[0].source, 'other');

    const fetched = await bus.exec(
      defs.getPayerProfileByEmailIdentity,
      emailIdentity(email),
    );

    assert.ok(fetched);
    assert.equal(fetched.emails.length, 1);
    assert.equal(fetched.emails[0].email, email);
    assert.equal(fetched.emails[0].priority, 'primary');
    assert.equal(fetched.emails[0].source, 'other');
  });

  test('creating from tko-aly id', async ({ bus, mockProcedure }) => {
    const mock = await mockProcedure(
      getUpstreamUserById,
      async ({ id }) => {
        return {
          id,
          screenName: 'Teppo Testaaja',
          email: 'test@test.test',
          username: 'test',
          role: 'kayttaja' as const,
        };
      },
      {
        times: 1,
      },
    );

    const id = tkoalyIdentity(1234);

    const created = await bus.exec(defs.createPayerProfileFromTkoalyIdentity, {
      id,
    });

    assert.ok(typeof mock.calls[0].arguments[0] === 'object');
    assert.ok(mock.calls[0].arguments[0]);
    assert.ok('token' in mock.calls[0].arguments[0]);
    assert.equal(mock.calls[0].arguments[0].token, 'token');

    assert.ok(created);
    assert.equal(created.name, 'Teppo Testaaja');
    assert.equal(created.emails.length, 1);
    assert.equal(created.emails[0].email, 'test@test.test');
    assert.equal(created.emails[0].source, 'tkoaly');
    assert.deepEqual(created.tkoalyUserId, id);
  });

  test('creating from tko-aly id with existing email', async ({
    bus,
    mockProcedure,
  }) => {
    const mock = await mockProcedure(
      getUpstreamUserById,
      async ({ id }) => {
        return {
          id,
          screenName: 'Teppo Testaaja',
          email: 'test@test.test',
          username: 'test',
          role: 'kayttaja' as const,
        };
      },
      {
        times: 1,
      },
    );

    const id = tkoalyIdentity(1234);

    const existing = await bus.exec(defs.createPayerProfileFromEmailIdentity, {
      id: emailIdentity('test@test.test'),
      name: 'Teppo E. Testaaja',
    });

    assert.ok(existing);

    const created = await bus.exec(defs.createPayerProfileFromTkoalyIdentity, {
      id,
    });

    assert.ok(typeof mock.calls[0].arguments[0] === 'object');
    assert.ok(mock.calls[0].arguments[0]);
    assert.ok('token' in mock.calls[0].arguments[0]);
    assert.equal(mock.calls[0].arguments[0].token, 'token');

    assert.ok(created);
    assert.equal(created.name, 'Teppo E. Testaaja');
    assert.equal(created.emails.length, 1);
    assert.equal(created.emails[0].email, 'test@test.test');
    assert.equal(created.emails[0].source, 'other');
    assert.deepEqual(created.tkoalyUserId, id);
  });

  test('merging profiles', async ({ bus, mockProcedure }) => {
    const emails = ['test@test.test', 'examplte@test.com'];

    const fromEmail = await bus.exec(defs.createPayerProfileFromEmailIdentity, {
      id: emailIdentity(emails[0]),
      name: 'Teppo 1. Testaaja',
    });

    assert.ok(fromEmail);

    await mockProcedure(
      getUpstreamUserById,
      async ({ id }) => {
        return {
          id,
          screenName: 'Teppo 2. Testaaja',
          email: emails[1],
          username: 'test',
          role: 'kayttaja' as const,
        };
      },
      {
        times: 1,
      },
    );

    const fromTkoaly = await bus.exec(
      defs.createPayerProfileFromTkoalyIdentity,
      {
        id: tkoalyIdentity(1234),
      },
    );

    assert.ok(fromTkoaly);

    const result = await bus.exec(defs.mergeProfiles, {
      primary: fromEmail.id,
      secondary: fromTkoaly.id,
    });

    assert.deepEqual(result, []);

    const merged = await bus.exec(
      defs.getPayerProfileByInternalIdentity,
      fromEmail.id,
    );

    assert.ok(merged);
    assert.equal(merged.disabled, false);
    assert.equal(merged.emails.length, 2);
    chai.containSubset(merged.emails, [
      {
        payerId: merged.id,
        priority: 'primary',
        email: emails[0],
        source: 'other',
      },
      {
        payerId: merged.id,
        priority: 'default',
        email: emails[1],
        source: 'tkoaly',
      },
    ]);

    const disabled = await bus.exec(
      defs.getPayerProfileByInternalIdentity,
      fromTkoaly.id,
    );

    assert.ok(disabled);
    assert.ok(disabled.disabled);
    assert.deepEqual(disabled.mergedTo, merged.id);
  });
});
