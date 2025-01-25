import {
  DbPayerProfile,
  InternalIdentity,
  isEmailIdentity,
  isInternalIdentity,
  isTkoalyIdentity,
  PayerProfile,
  internalIdentity,
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
import { BusContext } from '@/app';
import { ExecutionContext, PayloadOf } from '@/bus';
import { Connection } from '@/db/connection';
import routes from './api';
import { createModule } from '@/module';
import { formatPayerEmail, payerQuery } from './query';

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

export default createModule({
  name: 'payers',

  routes,

  async setup({ bus }) {
    bus.register(
      defs.getPayerProfiles,
      async ({ cursor, sort, limit }, { pg }) => {
        return payerQuery.execute(pg, {
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
      const { result } = await payerQuery.execute(pg, {
        where: sql`tkoaly_user_id = ${id.value}`,
        order: [['disabled', 'asc']],
        limit: 1,
      });

      return result[0] ?? null;
    });

    bus.register(defs.getPayerProfileByInternalIdentity, async (id, { pg }) => {
      const { result } = await payerQuery.execute(pg, {
        where: sql`id = ${id.value}`,
        limit: 1,
      });

      return result[0] ?? null;
    });

    bus.register(defs.getPayerProfileByEmailIdentity, async (id, { pg }) => {
      const { result } = await payerQuery.execute(pg, {
        where: sql`id IN (SELECT payer_id FROM payer_emails WHERE email = ${id.value}) AND NOT disabled`,
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
