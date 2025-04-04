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
import * as usersService from '@/modules/users/definitions';
import * as audit from '@/modules/audit/definitions';
import * as defs from './definitions';
import { sql } from '@/db/template';
import { cents } from '@bbat/common/build/src/currency';
import { BusContext } from '@/app';
import { ExecutionContext, PayloadOf } from '@/bus';
import { Connection } from '@/db/connection';
import routes from './api';
import { createModule } from '@/module';
import { createPaginatedQuery } from '@/db/pagination';

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
  primaryEmail: profile.primary_email ?? null,
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
  unpaidValue: profile.unpaid_value ? cents(profile.unpaid_value) : null,
  totalPaid:
    profile.total_paid === null
      ? null
      : cents(parseInt('' + profile.total_paid)),
  paidRatio: profile.paid_ratio as any,
});

const formatPayerEmail = (email: DbPayerEmail): PayerEmail => ({
  payerId: internalIdentity(email.payer_id),
  email: email.email,
  priority: email.priority,
  source: email.source,
  createdAt: email.created_at,
  updatedAt: email.updated_at,
});

const baseQuery = createPaginatedQuery<DbPayerProfile>(
  sql`
  WITH counts AS (
    SELECT
      d.payer_id,
      COUNT(DISTINCT d.id) FILTER (WHERE d.published_at IS NOT NULL AND NOT d.credited) AS debt_count,
      COUNT(DISTINCT d.id) FILTER (WHERE ds.is_paid) AS paid_count,
      COUNT(DISTINCT d.id) FILTER (WHERE NOT ds.is_paid AND d.published_at IS NOT NULL AND NOT d.credited) AS unpaid_count
    FROM debt d
    JOIN debt_statuses ds USING (id)
    GROUP BY d.payer_id
  ), totals AS (
    SELECT
      d.payer_id,
      COALESCE(SUM(dco.amount) FILTER (WHERE d.published_at IS NOT NULL AND NOT d.credited), 0) AS total,
      COALESCE(SUM(dco.amount) FILTER (WHERE ds.is_paid), 0) AS total_paid,
      COALESCE(SUM(dco.amount) FILTER (WHERE NOT ds.is_paid AND d.published_at IS NOT NULL AND NOT d.credited), 0) AS unpaid_value
    FROM debt d
    LEFT JOIN debt_statuses ds ON ds.id = d.id
    LEFT JOIN debt_component_mapping dcm ON dcm.debt_id = d.id
    LEFT JOIN debt_component dco ON dco.id = dcm.debt_component_id
    GROUP BY d.payer_id
  ), emails AS (
    SELECT
      e.payer_id,
      ARRAY_AGG(TO_JSON(e.*)) AS emails,
      ARRAY_AGG(e.email) FILTER (WHERE e.priority = 'primary') primary_emails
    FROM payer_emails e
    GROUP BY e.payer_id
  )
  SELECT
    pp.*,
    COALESCE(totals.total, 0) AS total,
    COALESCE(totals.total_paid, 0) AS total_paid,
    COALESCE(totals.unpaid_value, 0) AS unpaid_value,
    CASE
      WHEN totals.total > 0 THEN
        COALESCE(totals.total_paid::float, 0) / totals.total::float
      ELSE 0
    END AS paid_ratio,
    COALESCE(counts.debt_count, 0) AS debt_count,
    COALESCE(counts.paid_count, 0) AS paid_count,
    COALESCE(counts.unpaid_count, 0) AS unpaid_count,
    emails.*,
    (SELECT email FROM payer_emails WHERE payer_id = pp.id AND priority = 'primary') AS primary_email
  FROM payer_profiles pp
  LEFT JOIN counts ON pp.id = counts.payer_id
  LEFT JOIN totals ON pp.id = totals.payer_id
  LEFT JOIN emails ON pp.id = emails.payer_id
`,
  'id',
);

export default createModule({
  name: 'payers',

  routes,

  async setup({ bus }) {
    bus.register(
      defs.getPayerProfiles,
      async ({ cursor, sort, limit }, { pg }) => {
        return baseQuery(pg, {
          map: formatPayerProfile,
          limit,
          cursor,
          order: sort ? [[sort.column, sort.dir]] : undefined,
        });
      },
    );

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
      defs.updatePayerMemberId,
      async ({ payerId, memberId }, { pg }) => {
        await pg.do(
          sql`UPDATE payer_profiles SET tkoaly_user_id = ${memberId.value} WHERE id = ${payerId.value}`,
        );
      },
    );

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

    const logPayerEvent = async (
      bus: ExecutionContext<BusContext>,
      payer: PayerProfile,
      type: Extract<
        PayloadOf<typeof audit.logEvent>['type'],
        `payer.${string}`
      >,
      details?: Record<string, unknown>,
      links: PayloadOf<typeof audit.logEvent>['links'] = [],
    ) => {
      await bus.exec(audit.logEvent, {
        type,
        details,
        links: [
          {
            type: 'object',
            target: { type: 'payer', id: payer.id.value },
            label: payer.name,
          },
          ...links,
        ],
      });
    };

    const logUpdate = async (
      bus: ExecutionContext<BusContext>,
      payer: PayerProfile,
      field: string,
      oldValue: unknown,
      newValue: unknown,
    ) => {
      await logPayerEvent(bus, payer, 'payer.update', {
        field,
        oldValue,
        newValue,
      });
    };

    bus.register(
      defs.updatePayerName,
      async ({ payerId, name }, { pg }, bus) => {
        const existingProfile = await bus.exec(
          defs.getPayerProfileByInternalIdentity,
          payerId,
        );

        if (!existingProfile) {
          throw new Error('No such payer profile!');
        }

        await pg.one<DbPayerProfileWithEmails>(sql`
          UPDATE payer_profiles
          SET name = ${name}
          WHERE id = ${payerId.value}
        `);

        await logUpdate(
          bus,
          existingProfile,
          'name',
          existingProfile.name,
          name,
        );

        const updated = await bus.exec(
          defs.getPayerProfileByInternalIdentity,
          payerId,
        );

        if (!updated) {
          throw new Error('Failed to fetch updated payer profile!');
        }

        return updated;
      },
    );

    bus.register(
      defs.updatePayerDisabledStatus,
      async ({ payerId, disabled }, { pg }, bus) => {
        const existingProfile = await bus.exec(
          defs.getPayerProfileByInternalIdentity,
          payerId,
        );

        if (!existingProfile) {
          throw new Error('No such payer profile!');
        }

        await pg.one<DbPayerProfileWithEmails>(sql`
          UPDATE payer_profiles
          SET disabled = ${disabled}
          WHERE id = ${payerId.value}
          RETURNING *
        `);

        await logUpdate(
          bus,
          existingProfile,
          'disabled',
          existingProfile.disabled,
          disabled,
        );

        const updated = await bus.exec(
          defs.getPayerProfileByInternalIdentity,
          payerId,
        );

        if (!updated) {
          throw new Error('Failed to fetch updated payer profile!');
        }

        return updated;
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
            throw new Error(
              'payer profile already has a primary email address',
            );
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
      const { result } = await baseQuery(pg, {
        where: sql`tkoaly_user_id = ${id.value}`,
        map: formatPayerProfile,
        order: [['disabled', 'asc']],
        limit: 1,
      });

      return result[0] ?? null;
    });

    bus.register(defs.getPayerProfileByInternalIdentity, async (id, { pg }) => {
      const { result } = await baseQuery(pg, {
        where: sql`id = ${id.value}`,
        map: formatPayerProfile,
        limit: 1,
      });

      return result[0] ?? null;
    });

    bus.register(defs.getPayerProfileByEmailIdentity, async (id, { pg }) => {
      const { result } = await baseQuery(pg, {
        where: sql`id IN (SELECT payer_id FROM payer_emails WHERE email = ${id.value}) AND NOT disabled`,
        map: formatPayerProfile,
        limit: 1,
      });

      return result[0] ?? null;
    });

    bus.register(
      defs.getOrCreatePayerProfileForIdentity,
      async ({ id }, _, bus) => {
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
        });
      },
    );

    bus.register(
      defs.createPayerProfileForExternalIdentity,
      async ({ id, name }, _, bus) => {
        const existingPayerProfile = await bus.exec(
          defs.getPayerProfileByIdentity,
          id,
        );

        if (existingPayerProfile) {
          return existingPayerProfile;
        }

        if (isTkoalyIdentity(id)) {
          return bus.exec(defs.createPayerProfileFromTkoalyIdentity, {
            id,
          });
        }

        if (isEmailIdentity(id)) {
          if (!name) {
            throw new Error('Name required for payment profile');
          }

          return bus.exec(defs.createPayerProfileFromEmailIdentity, {
            id,
            name,
          });
        }

        return assertNever(id) as any; // eslint-disable-line
      },
    );

    bus.register(
      defs.createPayerProfileFromTkoalyIdentity,
      async ({ id }, { pg }, bus) => {
        const upstreamUser = await bus.exec(usersService.getUpstreamUserById, {
          id,
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
          throw new Error(
            'Could not create email record for hte payer profile',
          );
        }

        const result = await bus.exec(
          defs.getPayerProfileByInternalIdentity,
          internalIdentity(payerProfile.id),
        );

        if (!result) {
          throw new Error('Failed to create payer profile!');
        }

        await logPayerEvent(bus, result, 'payer.create', { source: 'email' });

        return result;
      },
    );

    async function replacePrimaryEmail(
      pg: Connection,
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
      pg: Connection,
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

      await logPayerEvent(bus, result, 'payer.create', { source: 'tkoaly' });

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

    bus.register(defs.mergeProfiles, async (params, { pg }, bus) => {
      const primaryProfile = await bus.exec(
        defs.getPayerProfileByInternalIdentity,
        params.primary,
      );
      const secondaryProfile = await bus.exec(
        defs.getPayerProfileByInternalIdentity,
        params.secondary,
      );

      if (!primaryProfile) {
        return [];
      }

      if (!secondaryProfile) {
        return [];
      }

      await pg.do(sql`
        UPDATE payer_profiles
        SET disabled = true, merged_to = ${primaryProfile.id.value}
        WHERE id = ${secondaryProfile.id.value}
      `);

      await pg.do(sql`
        UPDATE payer_profiles
        SET tkoaly_user_id = COALESCE(
          ${primaryProfile.tkoalyUserId?.value}::int,
          ${secondaryProfile.tkoalyUserId?.value}::int
        )
        WHERE id = ${primaryProfile.id.value}
      `);

      await pg.do(sql`
        INSERT INTO payer_emails (payer_id, email, priority, source)
        SELECT ${primaryProfile.id.value} AS payer_id, email, CASE WHEN priority = 'primary' THEN 'default' ELSE priority END AS priority, source
        FROM payer_emails
        WHERE payer_id = ${secondaryProfile.id.value}
        ON CONFLICT DO NOTHING
      `);

      const debts = await pg.many<{ id: string }>(
        sql`UPDATE debt SET payer_id = ${primaryProfile.id.value} WHERE payer_id = ${secondaryProfile.id.value} RETURNING id`,
      );

      await logPayerEvent(bus, primaryProfile, 'payer.merge', {}, [
        {
          type: 'from',
          target: { type: 'payer', id: secondaryProfile.name },
          label: secondaryProfile.name,
        },
      ]);

      return debts.map(debt => debt.id);
    });
  },
});
