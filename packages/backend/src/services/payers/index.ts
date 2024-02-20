import {
  DbPayerProfile,
  InternalIdentity,
  isEmailIdentity,
  isInternalIdentity,
  isTkoalyIdentity,
  PayerProfile,
  internalIdentity,
  tkoalyIdentity,
  UpstreamUser,
  emailIdentity,
  DbPayerEmail,
  PayerEmail,
  PayerPreferences,
  PayerEmailPriority,
} from '@bbat/common/build/src/types';
import * as usersService from '@/services/users/definitions';
import * as defs from './definitions';
import sql from 'sql-template-strings';
import { cents } from '@bbat/common/build/src/currency';
import { BusContext, ModuleDeps } from '@/app';
import { ExecutionContext } from '@/bus';
import { PoolConnection } from '@/db';

export type DbPayerProfileWithEmails = DbPayerProfile & {
  emails: DbPayerEmail[];
};

export type AddPayerEmailOptions = {
  email: string;
  priority?: PayerEmailPriority;
  source?: PayerEmail['source'];
  payerId: InternalIdentity;
};

// eslint-disable-next-line
function assertNever(_value: never) {
  throw new Error('Should-be unreachable code reached');
}

export const formatPayerProfile = (
  profile: DbPayerProfile & { emails?: DbPayerEmail[] },
): PayerProfile => ({
  id: internalIdentity(profile.id),
  tkoalyUserId: !profile.tkoaly_user_id
    ? null
    : tkoalyIdentity(profile.tkoaly_user_id),
  name: profile.name,
  createdAt: profile.created_at,
  updatedAt: profile.updated_at,
  disabled: profile.disabled,
  mergedTo: !profile.merged_to ? null : internalIdentity(profile.merged_to),
  emails: profile.emails ? profile.emails.map(formatPayerEmail) : [],
  debtCount: profile.debt_count ?? null,
  paidCount: profile.paid_count ?? null,
  unpaidCount: profile.unpaid_count ?? null,
  total: profile.total === null ? null : cents(parseInt('' + profile.total)),
  totalPaid:
    profile.total_paid === null
      ? null
      : cents(parseInt('' + profile.total_paid)),
});

const formatPayerEmail = (email: DbPayerEmail): PayerEmail => ({
  payerId: internalIdentity(email.payer_id),
  email: email.email,
  priority: email.priority,
  source: email.source,
  createdAt: email.created_at,
  updatedAt: email.updated_at,
});

export default ({ bus }: ModuleDeps) => {
  bus.register(defs.getPayerProfiles, async (_, { pg }) => {
    const dbProfiles = await pg.many<DbPayerProfileWithEmails>(sql`
        SELECT
          pp.*,
          (SELECT ARRAY_AGG(TO_JSON(e.*)) FROM payer_emails e WHERE e.payer_id = pp.id) AS emails,
          COUNT(DISTINCT d.id) as debt_count,
          COUNT(DISTINCT d.id) FILTER (WHERE ds.is_paid) AS paid_count,
          COUNT(DISTINCT d.id) FILTER (WHERE NOT ds.is_paid) AS unpaid_count,
          COALESCE(SUM(dco.amount), 0) AS total,
          COALESCE(SUM(dco.amount) FILTER (WHERE ds.is_paid), 0) AS total_paid
        FROM payer_profiles pp
        LEFT JOIN debt d ON d.payer_id = pp.id
        LEFT JOIN debt_statuses ds ON ds.id = d.id
        LEFT JOIN debt_component_mapping dcm ON dcm.debt_id = d.id
        LEFT JOIN debt_component dco ON dco.id = dcm.debt_component_id
        GROUP BY pp.id
      `);

    return dbProfiles.map(formatPayerProfile);
  });

  bus.register(defs.getPayerProfileByIdentity, async (id, _, bus) => {
    if (isTkoalyIdentity(id)) {
      return await bus.exec(defs.getPayerProfileByTkoalyIdentity, id);
    }

    if (isInternalIdentity(id)) {
      return await bus.exec(defs.getPayerProfileByInternalIdentity, id);
    }

    if (isEmailIdentity(id)) {
      return await bus.exec(defs.getPayerProfileByEmailIdentity, id);
    }

    return null;
  });

  // eslint-disable-next-line
  async function createDefaultPayerPreferences(
    _id: InternalIdentity,
  ): Promise<PayerPreferences> {
    return {
      uiLanguage: 'en',
      emailLanguage: 'en',
      hasConfirmedMembership: false,
    };
  }

  bus.register(defs.getPayerPreferences, async (id, { pg }) => {
    const row = await pg.one<{ preferences: PayerPreferences }>(
      sql`SELECT preferences FROM payer_profiles WHERE id = ${id.value}`,
    );

    if (!row?.preferences) {
      return await createDefaultPayerPreferences(id);
    }

    return row?.preferences;
  });

  bus.register(
    defs.updatePayerPreferences,
    async ({ id, preferences: newValues }, { pg }) => {
      const rows = await pg.many<{ preferences: PayerPreferences }>(
        sql`SELECT preferences FROM payer_profiles WHERE id = ${id.value}`,
      );

      let preferences = rows.length > 0 ? rows[0].preferences : null;

      if (preferences === null) {
        preferences = await createDefaultPayerPreferences(id);
      }

      Object.assign(preferences, newValues);

      const results = await pg.one<{ preferences: PayerPreferences }>(
        sql`UPDATE payer_profiles SET preferences = ${preferences} WHERE id = ${id.value} RETURNING preferences`,
      );

      if (results === null) {
        throw new Error('could not update payer preferences');
      }

      return results.preferences;
    },
  );

  bus.register(defs.getPayerPrimaryEmail, async (id, { pg }) => {
    const email = await pg
      .one<DbPayerEmail>(
        sql`
        SELECT *
        FROM payer_emails
        WHERE payer_id = ${id.value} AND priority = 'primary'
      `,
      )
      .then(email => email && formatPayerEmail(email));

    return email;
  });

  bus.register(defs.getPayerEmails, async (id, { pg }) => {
    const emails = await pg
      .many<DbPayerEmail>(
        sql`
        SELECT *
        FROM payer_emails
        WHERE payer_id = ${id.value}
      `,
      )
      .then(emails => emails.map(formatPayerEmail));

    return emails;
  });

  bus.register(
    defs.updatePayerEmailPriority,
    async ({ payerId, priority, email }, { pg }) => {
      const primary = await pg.one<{ email: string }>(
        sql`SELECT email FROM payer_emails WHERE payer_id = ${payerId.value} AND priority = 'primary'`,
      );

      if (primary && priority === 'primary' && email !== primary.email) {
        throw new Error('payer profile already has a primary email address');
      }

      const result = await pg.one<DbPayerEmail>(sql`
        UPDATE payer_emails
        SET priority = ${priority}
        WHERE email = ${email} AND payer_id = ${payerId.value}
        RETURNING *
      `);

      if (!result) {
        throw new Error('No such email!');
      }

      return result && formatPayerEmail(result);
    },
  );

  bus.register(defs.updatePayerName, async ({ payerId, name }, { pg }, bus) => {
    const updated = await pg.one<DbPayerProfileWithEmails>(sql`
      UPDATE payer_profiles
      SET name = ${name}
      WHERE id = ${payerId.value}
      RETURNING *
    `);

    if (!updated) {
      throw 'Could not update payer name';
    }

    return {
      ...formatPayerProfile(updated),
      emails: await bus.exec(defs.getPayerEmails, payerId),
    };
  });

  bus.register(
    defs.updatePayerDisabledStatus,
    async ({ payerId, disabled }, { pg }, bus) => {
      const updated = await pg.one<DbPayerProfileWithEmails>(sql`
      UPDATE payer_profiles
      SET disabled = ${disabled}
      WHERE id = ${payerId.value}
      RETURNING *
    `);

      if (!updated) {
        throw 'Could not update payer profile disabled status';
      }

      return {
        ...formatPayerProfile(updated),
        emails: await bus.exec(defs.getPayerEmails, payerId),
      };
    },
  );

  bus.register(
    defs.addPayerEmail,
    async (params: AddPayerEmailOptions, { pg }, bus) => {
      const currentPrimary = await bus.exec(
        defs.getPayerPrimaryEmail,
        params.payerId,
      );

      let priority = params.priority;

      if (!currentPrimary) {
        if (priority && priority !== 'primary') {
          throw new Error('payer profile already has a primary email address');
        }

        priority = 'primary';
      }

      const row = await pg.one<DbPayerEmail>(sql`
        INSERT INTO payer_emails (payer_id, email, priority, source)
        VALUES (${params.payerId.value}, ${params.email}, ${priority}, ${
          params.source ?? 'other'
        })
        RETURNING *
      `);

      if (!row) {
        throw 'Could not create payer email.';
      }

      return formatPayerEmail(row);
    },
  );

  bus.register(defs.getPayerProfileByTkoalyIdentity, async (id, { pg }) => {
    const [dbProfile] = await pg.many<DbPayerProfileWithEmails>(sql`
        SELECT
          pp.*,
          (SELECT ARRAY_AGG(TO_JSON(e.*)) FROM payer_emails e WHERE e.payer_id = pp.id) AS emails
        FROM payer_profiles pp
        WHERE tkoaly_user_id = ${id.value}`);

    if (dbProfile) {
      return formatPayerProfile(dbProfile);
    }

    return null;
  });

  bus.register(defs.getPayerProfileByInternalIdentity, async (id, { pg }) => {
    const [dbProfile] = await pg.many<DbPayerProfileWithEmails>(sql`
        SELECT
          pp.*,
          (SELECT ARRAY_AGG(TO_JSON(e.*)) FROM payer_emails e WHERE e.payer_id = pp.id) AS emails
        FROM payer_profiles pp
        WHERE id = ${id.value}
      `);

    if (dbProfile) {
      return formatPayerProfile(dbProfile);
    }

    return null;
  });

  bus.register(defs.getPayerProfileByEmailIdentity, async (id, { pg }) => {
    const [dbProfile] = await pg.many<DbPayerProfileWithEmails>(sql`
      SELECT
        pp.*,
        (SELECT ARRAY_AGG(TO_JSON(e.*)) FROM payer_emails e WHERE e.payer_id = pp.id) AS emails
      FROM payer_profiles pp
      WHERE pp.id IN (SELECT payer_id FROM payer_emails WHERE email = ${id.value}) AND NOT pp.disabled
    `);

    if (dbProfile) {
      return formatPayerProfile(dbProfile);
    }

    return null;
  });

  bus.register(
    defs.getOrCreatePayerProfileForIdentity,
    async ({ id, token }, _, bus) => {
      const existingPayerProfile = await bus.exec(
        defs.getPayerProfileByIdentity,
        id,
      );

      if (existingPayerProfile) {
        return existingPayerProfile;
      }

      if (isInternalIdentity(id)) {
        return null;
      }

      return bus.exec(defs.createPayerProfileForExternalIdentity, {
        id,
        token,
      });
    },
  );

  bus.register(
    defs.createPayerProfileForExternalIdentity,
    async ({ id, token, name }, _, bus) => {
      const existingPayerProfile = await bus.exec(
        defs.getPayerProfileByIdentity,
        id,
      );

      if (existingPayerProfile) {
        return existingPayerProfile;
      }

      if (isTkoalyIdentity(id)) {
        if (token) {
          return bus.exec(defs.createPayerProfileFromTkoalyIdentity, {
            id,
            token,
          });
        }

        throw new Error('Not authorized for user information');
      }

      if (isEmailIdentity(id)) {
        if (!name) {
          throw new Error('Name required for payment profile');
        }

        return bus.exec(defs.createPayerProfileFromEmailIdentity, { id, name });
      }

      return assertNever(id) as any; // eslint-disable-line
    },
  );

  bus.register(
    defs.createPayerProfileFromTkoalyIdentity,
    async ({ id, token }, { pg }, bus) => {
      const upstreamUser = await bus.exec(usersService.getUpstreamUserById, {
        id,
        token,
      });

      if (!upstreamUser) {
        throw new Error('Upstream user not found!');
      }

      return createPayerProfileFromTkoalyUser(bus, pg, upstreamUser);
    },
  );

  bus.register(
    defs.createPayerProfileFromEmailIdentity,
    async ({ id, name }, { pg }, bus) => {
      const payerProfile = await pg.one<DbPayerProfile>(
        sql`INSERT INTO payer_profiles (name) VALUES (${name}) RETURNING id`,
      );

      if (!payerProfile) {
        throw new Error('Could not create a new payer profile');
      }

      const email = await pg.one<DbPayerEmail>(sql`
      INSERT INTO payer_emails (email, payer_id, priority)
      VALUES (${id.value}, ${payerProfile.id}, 'primary')
      RETURNING *
    `);

      if (!email) {
        throw new Error('Could not create email record for hte payer profile');
      }

      return bus.exec(
        defs.getPayerProfileByInternalIdentity,
        internalIdentity(payerProfile.id),
      );
    },
  );

  async function replacePrimaryEmail(
    pg: PoolConnection,
    id: InternalIdentity,
    email: string,
  ) {
    await pg.do(sql`
      UPDATE payer_emails
      SET priority = 'default', updated_at = NOW()
      WHERE payer_id = ${id.value} AND priority = 'primary'
    `);

    await pg.do(sql`
      INSERT INTO payer_emails (payer_id, priority, email)
      VALUES (${id.value}, 'primary', ${email})
    `);
  }

  async function createPayerProfileFromTkoalyUser(
    bus: ExecutionContext<BusContext>,
    pg: PoolConnection,
    user: UpstreamUser,
  ): Promise<PayerProfile> {
    const existingPayerProfile = await bus.exec(
      defs.getPayerProfileByTkoalyIdentity,
      user.id,
    );

    if (existingPayerProfile) {
      const emails = await bus.exec(
        defs.getPayerEmails,
        existingPayerProfile.id,
      );

      if (!emails.some(({ email }) => email === user.email)) {
        await replacePrimaryEmail(pg, existingPayerProfile.id, user.email);

        //if (existingPayerProfile.stripeCustomerId) {
        /*await stripe.customers.update(existingPayerProfile.stripeCustomerId, {
            email: user.email,
          })*/
        //}
      }

      return existingPayerProfile;
    }

    const existingEmailProfile = await bus.exec(
      defs.getPayerProfileByEmailIdentity,
      emailIdentity(user.email),
    );

    if (existingEmailProfile) {
      await pg.do(sql`
         UPDATE payer_profiles
         SET tkoaly_user_id = ${user.id.value}
         WHERE id = ${existingEmailProfile.id.value}
      `);

      return {
        ...existingEmailProfile,
        tkoalyUserId: user.id,
      };
    }

    const dbPayerProfile = await pg.one<DbPayerProfile>(sql`
      INSERT INTO payer_profiles (tkoaly_user_id, name)
      VALUES (${user.id.value}, ${user.screenName})
      RETURNING *
    `);

    if (!dbPayerProfile) {
      throw new Error('Could not create payer profile');
    }

    const dbPayerEmail = await pg.one<DbPayerEmail>(sql`
      INSERT INTO payer_emails (payer_id, email, priority, source)
      VALUES (${dbPayerProfile.id}, ${user.email}, 'primary', 'tkoaly')
      RETURNING *
    `);

    if (!dbPayerEmail) {
      throw new Error('Could not create email record for payer profile');
    }

    const result = await bus.exec(
      defs.getPayerProfileByInternalIdentity,
      internalIdentity(dbPayerProfile.id),
    );

    if (!result) {
      throw new Error('Failed to fetch created payer profile!');
    }

    return result;
  }

  bus.register(
    defs.setProfileTkoalyIdentity,
    async ({ id, tkoalyId }, { pg }) => {
      await pg.do(sql`
      UPDATE payer_profiles
      SET tkoaly_user_id = ${tkoalyId.value}
      WHERE id = ${id.value}
    `);
    },
  );

  bus.register(defs.mergeProfiles, async ({ primary, secondary }, { pg }) => {
    await pg.do(sql`
      UPDATE payer_profiles
      SET disabled = true, merged_to = ${primary.value}
      WHERE id = ${secondary.value}
    `);

    await pg.do(sql`
      INSERT INTO payer_emails (payer_id, email, priority, source)
      SELECT ${primary.value} AS payer_id, email, CASE WHEN priority = 'primary' THEN 'default' ELSE priority END AS priority, source
      FROM payer_emails
      WHERE payer_id = ${secondary.value}
      ON CONFLICT DO NOTHING
    `);

    const debts = await pg.many<{ id: string }>(
      sql`UPDATE debt SET payer_id = ${primary.value} WHERE payer_id = ${secondary.value} RETURNING id`,
    );

    return debts.map(debt => debt.id);
  });
};
