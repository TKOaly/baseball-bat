import { PayerService } from '../../src/services/payers';
import {
  emailIdentity,
  tkoalyIdentity,
  UpstreamUser,
} from '@bbat/common/types';
import { expect } from 'earl';
import { createTestFunc } from '../common';
import { cents } from '@bbat/common/currency';

const test = createTestFunc();

test('Creating payer profile from email identity', async t => {
  const { container } = t.context;

  const payers = container.get(PayerService);

  const payer = {
    name: 'Teppo Testaaja',
    emails: [{ email: 'test@example.org' }],
  };

  const id = emailIdentity(payer.emails[0].email);

  const created = await payers.createPayerProfileFromEmailIdentity(id, {
    name: payer.name,
  });

  t.like(created, payer);

  const byEmail = await payers.getPayerProfileByEmailIdentity(id);

  t.like(byEmail, { ...payer, id: created.id });

  const byInternal = await payers.getPayerProfileByInternalIdentity(created.id);

  t.like(byInternal, { ...payer, id: created.id });
});

test('Merging profiles', async t => {
  const { container } = t.context;

  const payers = container.get(PayerService);

  const payer1 = {
    name: 'Teppo Testaaja',
    emails: [{ email: 'teppo@example.org' }],
  };

  const payer2 = {
    name: 'Testaaja, Teppo',
    emails: [{ email: 'teppo1337@hotmail.com' }],
  };

  const created1 = await payers.createPayerProfileFromEmailIdentity(
    emailIdentity(payer1.emails[0].email),
    {
      name: payer1.name,
    },
  );

  t.false(created1.disabled);
  t.is(created1.emails.length, 1);
  t.is(created1.emails[0].email, payer1.emails[0].email);
  t.is(created1.name, payer1.name);

  const created2 = await payers.createPayerProfileFromEmailIdentity(
    emailIdentity(payer2.emails[0].email),
    {
      name: payer2.name,
    },
  );

  t.false(created2.disabled);
  t.is(created2.emails.length, 1);
  t.is(created2.emails[0].email, payer2.emails[0].email);
  t.is(created2.name, payer2.name);

  const affectedDebts = await payers.mergeProfiles(created1.id, created2.id);

  t.is(affectedDebts.length, 0);

  const disabled = await payers.getPayerProfileByInternalIdentity(created2.id);

  if (disabled === null) {
    t.fail();
    return;
  }

  t.true(disabled.disabled);

  const merged = await payers.getPayerProfileByInternalIdentity(created1.id);

  if (merged === null) {
    t.fail();
    return;
  }

  t.false(merged.disabled);
  t.is(merged.emails.length, 2);
  t.true(merged.emails.some(email => email.email === payer1.emails[0].email));
  t.true(merged.emails.some(email => email.email === payer2.emails[0].email));
  t.is(merged.name, payer1.name);
});

test('Setting payer profile TKO-äly identity', async t => {
  const { container } = t.context;

  const payers = container.get(PayerService);

  const email = 'test@example.org';
  const payer = {
    name: 'Teppo Testaaja',
    emails: [{ email }],
  };

  const id = emailIdentity(email);

  const created = await payers.createPayerProfileFromEmailIdentity(id, {
    name: payer.name,
  });

  if (created === null) {
    t.fail();
    return;
  }

  const byEmail = await payers.getPayerProfileByEmailIdentity(id);

  if (byEmail === null) {
    t.fail();
    return;
  }

  t.is(byEmail.tkoalyUserId, undefined);

  const tkoalyId = tkoalyIdentity(1234);
  await payers.setProfileTkoalyIdentity(created.id, tkoalyId);

  const byEmailAfter = await payers.getPayerProfileByEmailIdentity(id);

  if (byEmailAfter === null) {
    t.fail();
    return;
  }

  t.deepEqual(byEmailAfter.tkoalyUserId, tkoalyId);
});

test('Creating payer profile from TKO-äly user', async t => {
  const { container } = t.context;

  const payers = container.get(PayerService);

  const user: UpstreamUser = {
    id: 1234,
    screenName: 'Mikko Mallikas',
    email: 'mikko@example.org',
    username: 'kasmilli',
    role: 'virkailija',
  };

  const created = await payers.createPayerProfileFromTkoalyUser(user);

  expect(created).not.toBeNullish();

  expect(created).toEqual(
    expect.subset({
      name: user.screenName,
      emails: expect.includes(
        expect.subset({
          email: user.email,
          priority: 'primary',
        }),
      ),
      tkoalyUserId: tkoalyIdentity(1234),
    }),
  );
});

test('Listing payer profiles', async t => {
  const { container } = t.context;

  const payers = container.get(PayerService);
  const created = [];

  for (let i = 0; i < 3; i++) {
    const email = `test-${i}@example.org`;

    const payer = {
      name: `Teppo #${i} Testaaja`,
      emails: [{ email }],
    };

    const id = emailIdentity(email);

    created.push(
      await payers.createPayerProfileFromEmailIdentity(id, {
        name: payer.name,
      }),
    );
  }

  const list = await payers.getPayerProfiles();

  expect(list).toHaveLength(created.length);

  created.forEach(created =>
    expect(list).toInclude({
      id: {
        type: 'internal',
        value: expect.regex(
          /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/,
        ),
      },
      tkoalyUserId: expect.nullish(),
      email: expect.nullish(),
      name: created.name,
      stripeCustomerId: expect.nullish(),
      createdAt: expect.a(Date),
      updatedAt: expect.a(Date),
      mergedTo: expect.nullish(),
      emails: expect.a(Array),
      debtCount: 0,
      paidCount: 0,
      unpaidCount: 0,
      total: cents(0),
      totalPaid: cents(0),
      disabled: false,
    }),
  );
});

test('Getting payer profile', async t => {
  const { container } = t.context;

  const payers = container.get(PayerService);

  const user: UpstreamUser = {
    id: 1234,
    screenName: 'Mikko Mallikas',
    email: 'mikko@example.org',
    username: 'kasmilli',
    role: 'virkailija',
  };

  const created = await payers.createPayerProfileFromTkoalyUser(user);

  const matcher = expect.subset({
    name: user.screenName,
    emails: expect.includes(
      expect.subset({
        email: user.email,
        priority: 'primary',
      }),
    ),
    tkoalyUserId: tkoalyIdentity(1234),
  });

  expect(await payers.getPayerProfileByIdentity(created.id)).toEqual(matcher);
  expect(
    await payers.getPayerProfileByIdentity(emailIdentity(user.email)),
  ).toEqual(matcher);
  expect(
    await payers.getPayerProfileByIdentity(tkoalyIdentity(user.id)),
  ).toEqual(matcher);
});

test('Getting default payer preferences', async t => {
  const { container } = t.context;

  const payers = container.get(PayerService);

  const payer = {
    name: 'Teppo Testaaja',
    emails: [{ email: 'test@example.org' }],
  };

  const id = emailIdentity(payer.emails[0].email);

  const created = await payers.createPayerProfileFromEmailIdentity(id, {
    name: payer.name,
  });

  const preferences = await payers.getPayerPreferences(created.id);

  expect(preferences).toEqual({
    uiLanguage: 'en',
    emailLanguage: 'en',
    hasConfirmedMembership: false,
  });
});

test('Updating payer preferences', async t => {
  const { container } = t.context;

  const payers = container.get(PayerService);

  const payer = {
    name: 'Teppo Testaaja',
    emails: [{ email: 'test@example.org' }],
  };

  const id = emailIdentity(payer.emails[0].email);

  const created = await payers.createPayerProfileFromEmailIdentity(id, {
    name: payer.name,
  });

  const preferences = await payers.getPayerPreferences(created.id);

  expect(preferences).toEqual({
    uiLanguage: 'en',
    emailLanguage: 'en',
    hasConfirmedMembership: false,
  });

  await payers.updatePayerPreferences(created.id, {
    hasConfirmedMembership: true,
    uiLanguage: 'fi',
    emailLanguage: 'fi',
  });

  const updated = await payers.getPayerPreferences(created.id);

  expect(updated).toEqual({
    uiLanguage: 'fi',
    emailLanguage: 'fi',
    hasConfirmedMembership: true,
  });
});

test('Getting and updating payer emails', async t => {
  const { container } = t.context;

  const payers = container.get(PayerService);

  const email = 'test@example.org';
  const payer = {
    name: 'Teppo Testaaja',
    emails: [{ email }],
  };

  const id = emailIdentity(email);

  const created = await payers.createPayerProfileFromEmailIdentity(id, {
    name: payer.name,
  });

  const emails = await payers.getPayerEmails(created.id);

  expect(emails).toHaveLength(1);
  expect(emails[0]).toEqual(
    expect.subset({
      email,
      priority: 'primary',
      source: 'other',
    }),
  );

  await payers.addPayerEmail({
    email: 'test+default@example.org',
    priority: 'default',
    source: 'user',
    payerId: created.id,
  });

  await payers.addPayerEmail({
    email: 'test+disabled@example.org',
    priority: 'disabled',
    source: 'tkoaly',
    payerId: created.id,
  });

  const emailsAfter = await payers.getPayerEmails(created.id);

  expect(emailsAfter).toHaveLength(3);

  expect(emailsAfter).toEqual(
    expect.includes(
      expect.subset({
        email,
        priority: 'primary',
        source: 'other',
      }),
      expect.subset({
        email: 'test+disabled@example.org',
        priority: 'disabled',
        source: 'tkoaly',
      }),
      expect.subset({
        email: 'test+default@example.org',
        priority: 'default',
        source: 'user',
      }),
    ),
  );

  const primaryEmail = await payers.getPayerPrimaryEmail(created.id);

  expect(primaryEmail).toEqual(
    expect.subset({
      email,
      priority: 'primary',
      source: 'other',
    }),
  );

  await payers.replacePrimaryEmail(created.id, 'test+new-primary@example.org');

  const emailsAfterPrimaryChange = await payers.getPayerEmails(created.id);

  expect(emailsAfterPrimaryChange).toEqual(
    expect.includes(
      expect.subset({
        email,
        priority: 'default',
        source: 'other',
      }),
      expect.subset({
        email: 'test+disabled@example.org',
        priority: 'disabled',
        source: 'tkoaly',
      }),
      expect.subset({
        email: 'test+default@example.org',
        priority: 'default',
        source: 'user',
      }),
      expect.subset({
        email: 'test+new-primary@example.org',
        priority: 'primary',
        source: 'other',
      }),
    ),
  );
});

test('Creating profile for TKO-äly user, with existing profile with same email', async t => {
  const { container } = t.context;

  const payers = container.get(PayerService);

  const email = 'test@example.org';
  const payer = {
    name: 'Teppo Testaaja',
    emails: [{ email }],
  };

  const id = emailIdentity(email);

  const created1 = await payers.createPayerProfileFromEmailIdentity(id, {
    name: payer.name,
  });

  const user: UpstreamUser = {
    id: 1234,
    screenName: 'Teppo Taavetti Testaaja',
    email,
    username: 'triplet',
    role: 'virkailija',
  };

  const created2 = await payers.createPayerProfileFromTkoalyUser(user);

  expect(created2).toEqual(
    expect.subset({
      id: created1.id,
      name: created1.name,
      tkoalyUserId: tkoalyIdentity(user.id),
      emails: expect.length(1),
    }),
  );
});
