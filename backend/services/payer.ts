// import { Stripe } from 'stripe'
import {
  DbPayerProfile,
  DbPaymentMethod,
  EmailIdentity,
  Event,
  EventWithPaymentStatus,
  ExternalIdentity,
  InternalIdentity,
  isEmailIdentity,
  isInternalIdentity,
  isTkoalyIdentity,
  PayerIdentity,
  PayerProfile,
  PaymentMethod,
  PaymentStatus,
  TkoalyIdentity,
  internalIdentity,
  tkoalyIdentity,
  UpstreamUser,
  emailIdentity,
  DbPayerEmail,
  PayerEmail,
  PayerPreferences,
  PayerEmailPriority,
} from '../../common/types'
import { appendAll, PgClient } from '../db'
import sql from 'sql-template-strings'
import { EventsService } from './events'
import * as R from 'remeda'
import { Inject, Service } from 'typedi'
import { UsersService } from './users'
import { cents } from '../../common/currency'

export type DbPayerProfileWithEmails = DbPayerProfile & { emails: DbPayerEmail[] }

export type AddPayerEmailOptions = {
  email: string,
  priority?: PayerEmailPriority,
  source?: PayerEmail['source'],
  payerId: InternalIdentity,
}

function assertNever(_value: never) {
  throw new Error('Should-be unreachable code reached')
}

export const formatPayerProfile = (profile: DbPayerProfile & { emails?: DbPayerEmail[] }): PayerProfile => ({
  id: internalIdentity(profile.id),
  tkoalyUserId: profile.tkoaly_user_id === undefined
    ? undefined
    : tkoalyIdentity(profile.tkoaly_user_id),
  email: profile.email,
  name: profile.name,
  stripeCustomerId: profile.stripe_customer_id,
  createdAt: profile.created_at,
  updatedAt: profile.updated_at,
  disabled: profile.disabled,
  mergedTo: profile.merged_to === undefined
    ? undefined
    : internalIdentity(profile.merged_to),
  emails: profile.emails ? profile.emails.map(formatPayerEmail) : [],
  debtCount: profile.debt_count,
  paidCount: profile.paid_count,
  unpaidCount: profile.unpaid_count,
  total: profile.total === undefined ? undefined : cents(parseInt('' + profile.total)),
})

const formatPaymentMethod = (method: DbPaymentMethod): PaymentMethod => ({
  id: method.id,
  payerId: internalIdentity(method.payer_id),
  stripePaymentMethodId: method.stripe_pm_id,
  brand: method.brand,
  last4: method.last4,
  expMonth: method.exp_month,
  expYear: method.exp_year,
  createdAt: method.created_at,
  updatedAt: method.updated_at,
})

const formatPayerEmail = (email: DbPayerEmail): PayerEmail => ({
  payerId: internalIdentity(email.payer_id),
  email: email.email,
  priority: email.priority,
  source: email.source,
  createdAt: email.created_at,
  updatedAt: email.updated_at,
})

@Service()
export class PayerService {
  @Inject(() => PgClient)
  pg: PgClient

  // @Inject('stripe')
  // stripe: Stripe

  @Inject(() => EventsService)
  eventsService: EventsService

  @Inject(() => UsersService)
  usersService: UsersService

  async getPayerProfiles() {
    const dbProfiles = await this.pg
      .many<DbPayerProfileWithEmails>(sql`
        SELECT
          pp.*,
          (SELECT ARRAY_AGG(TO_JSON(e.*)) FROM payer_emails e WHERE e.payer_id = pp.id) AS emails,
          COUNT(DISTINCT d.id) as debt_count,
          COUNT(DISTINCT d.id) FILTER (WHERE ds.is_paid) AS paid_count,
          COUNT(DISTINCT d.id) FILTER (WHERE NOT ds.is_paid) AS unpaid_count,
          SUM(dco.amount) AS total,
          COALESCE(SUM(dco.amount) FILTER (WHERE ds.is_paid), 0) AS paid_total
        FROM payer_profiles pp
        LEFT JOIN debt d ON d.payer_id = pp.id
        LEFT JOIN debt_statuses ds ON ds.id = d.id
        LEFT JOIN debt_component_mapping dcm ON dcm.debt_id = d.id
        LEFT JOIN debt_component dco ON dco.id = dcm.debt_component_id
        GROUP BY pp.id
      `)

    return dbProfiles.map(formatPayerProfile)
  }

  async getPayerProfileByIdentity(id: PayerIdentity) {
    if (isTkoalyIdentity(id)) {
      return await this.getPayerProfileByTkoalyIdentity(id);
    }

    if (isInternalIdentity(id)) {
      return await this.getPayerProfileByInternalIdentity(id);
    }

    if (isEmailIdentity(id)) {
      return await this.getPayerProfileByEmailIdentity(id);
    }

    return assertNever(id)
  }

  private async createDefaultPayerPreferences(_id: InternalIdentity): Promise<PayerPreferences> {
    return {
      uiLanguage: 'en',
      emailLanguage: 'en',
      hasConfirmedMembership: false,
    }
  }

  async getPayerPreferences(id: InternalIdentity) {
    const row = await this.pg.one<{ preferences: PayerPreferences }>(sql`SELECT preferences FROM payer_profiles WHERE id = ${id.value}`);

    if (!row?.preferences) {
      return await this.createDefaultPayerPreferences(id);
    }

    return row?.preferences;
  }

  async updatePayerPreferences(id: InternalIdentity, newValues: Partial<PayerPreferences>) {
    return await this.pg.tx(async (tx) => {
      const rows = await tx.do<{ preferences: PayerPreferences }>(sql`SELECT preferences FROM payer_profiles WHERE id = ${id.value}`);

      let preferences = rows.length > 0 ? rows[0].preferences : null

      if (preferences === null) {
        preferences = await this.createDefaultPayerPreferences(id);
      }

      Object.assign(preferences, newValues);

      const results = await tx.do<{ preferences: PayerPreferences }>(sql`UPDATE payer_profiles SET preferences = ${preferences} WHERE id = ${id.value} RETURNING preferences`)

      if (results.length === 0) {
        throw new Error("could not update payer preferences");
      }

      return results[0].preferences;
    })
  }

  async getPayerPrimaryEmail(id: InternalIdentity) {
    const email = await this.pg
      .one<DbPayerEmail>(sql`
        SELECT *
        FROM payer_emails
        WHERE payer_id = ${id.value} AND priority = 'primary'
      `)
      .then((email) => email && formatPayerEmail(email))

    return email
  }

  async getPayerEmails(id: InternalIdentity) {
    const emails = await this.pg
      .any<DbPayerEmail>(sql`
        SELECT *
        FROM payer_emails
        WHERE payer_id = ${id.value}
      `)
      .then((emails) => emails.map(formatPayerEmail))

    return emails
  }

  async updatePayerEmailPriority(iid: InternalIdentity, email: string, priority: PayerEmailPriority) {
    const primary = await this.pg.one<{ email: string }>(sql`SELECT email FROM payer_emails WHERE payer_id = ${iid.value} AND priority = 'primary'`)

    if (primary && priority === 'primary' && email !== primary.email) {
      throw new Error('payer profile already has a primary email address')
    }

    await this.pg.any(sql`
      UPDATE payer_emails
      SET priority = ${priority}
      WHERE email = ${email} AND payer_id = ${iid.value}
    `)
  }

  async updatePayerName(id: InternalIdentity, name: string) {
    const updated = await this.pg.one<DbPayerProfileWithEmails>(sql`
      UPDATE payer_profiles
      SET name = ${name}
      WHERE id = ${id.value}
      RETURNING *
    `)

    if (!updated) {
      throw 'Could not update payer name'
    }

    return {
      ...formatPayerProfile(updated),
      emails: await this.getPayerEmails(id),
    }
  }

  async addPayerEmail(params: AddPayerEmailOptions) {
    const currentPrimary = await this.getPayerPrimaryEmail(params.payerId)

    let priority = params.priority

    if (!currentPrimary) {
      if (priority && priority !== 'primary') {
        throw new Error('payer profile already has a primary email address');
      }

      priority = 'primary';
    }

    const row = await this.pg
      .one<DbPayerEmail>(sql`
        INSERT INTO payer_emails (payer_id, email, priority, source)
        VALUES (${params.payerId.value}, ${params.email}, ${priority}, ${params.source ?? 'other'})
        RETURNING *
      `)

    if (!row) {
      throw 'Could not create payer email.'
    }

    return formatPayerEmail(row);
  }

  async getPayerProfileByTkoalyIdentity(id: TkoalyIdentity) {
    const dbProfile = await this.pg
      .one<DbPayerProfileWithEmails>(sql`
        SELECT
          pp.*,
          (SELECT ARRAY_AGG(TO_JSON(e.*)) FROM payer_emails e WHERE e.payer_id = pp.id) AS emails
        FROM payer_profiles pp
        WHERE tkoaly_user_id = ${id.value}`
      )

    if (dbProfile) {
      return formatPayerProfile(dbProfile)
    }

    return null
  }

  async getPayerProfileByInternalIdentity(id: InternalIdentity) {
    const dbProfile = await this.pg
      .one<DbPayerProfileWithEmails>(sql`
        SELECT
          pp.*,
          (SELECT ARRAY_AGG(TO_JSON(e.*)) FROM payer_emails e WHERE e.payer_id = pp.id) AS emails
        FROM payer_profiles pp
        WHERE id = ${id.value}
      `)

    if (dbProfile) {
      return formatPayerProfile(dbProfile)
    }

    return null
  }

  async getPayerProfileByEmailIdentity(id: EmailIdentity) {
    const dbProfile = await this.pg.one<DbPayerProfileWithEmails>(sql`
      SELECT
        pp.*,
        (SELECT ARRAY_AGG(TO_JSON(e.*)) FROM payer_emails e WHERE e.payer_id = pp.id) AS emails
      FROM payer_profiles pp
      WHERE pp.id = (SELECT payer_id FROM payer_emails WHERE email = ${id.value})
    `)

    if (dbProfile) {
      return formatPayerProfile(dbProfile)
    }

    return null
  }

  async getOrCreatePayerProfileForIdentity(id: PayerIdentity, token?: string): Promise<PayerProfile | null> {
    const existingPayerProfile = await this.getPayerProfileByIdentity(id);

    if (existingPayerProfile) {
      return existingPayerProfile;
    }

    if (isInternalIdentity(id)) {
      return null;
    }

    return this.createPayerProfileForExternalIdentity(id, token);
  }


  async createPayerProfileForExternalIdentity(id: ExternalIdentity, token?: string, name?: string): Promise<PayerProfile | null> {
    const existingPayerProfile = await this.getPayerProfileByIdentity(id);

    if (existingPayerProfile) {
      return existingPayerProfile;
    }

    if (isTkoalyIdentity(id)) {
      if (token) {
        return this.createPayerProfileFromTkoalyIdentity(id, token);
      }

      throw new Error('Not authorized for user information')
    }

    if (isEmailIdentity(id)) {
      if (!name) {
        throw new Error('Name required for payment profile')
      }

      return this.createPayerProfileFromEmailIdentity(id, { name });
    }

    return assertNever(id) as any
  }

  async createPayerProfileFromTkoalyIdentity(id: TkoalyIdentity, token: string) {
    const upstreamUser = await this.usersService.getUpstreamUserById(id, token)
    return this.createPayerProfileFromTkoalyUser(upstreamUser)
  }

  async createPayerProfileFromEmailIdentity(id: EmailIdentity, details: { name: string }) {
    const payerProfile = await this.pg
      .one<DbPayerProfile>(sql`INSERT INTO payer_profiles (name) VALUES (${details.name}) RETURNING *`)

    if (!payerProfile) {
      throw new Error('Could not create a new payer profile')
    }

    const email = await this.pg.one<DbPayerEmail>(sql`
      INSERT INTO payer_emails (email, payer_id, priority)
      VALUES (${id.value}, ${payerProfile.id}, 'primary')
      RETURNING *
    `)

    if (!email) {
      throw new Error('Could not create email record for hte payer profile')
    }

    return formatPayerProfile({
      ...payerProfile,
      emails: [email],
    })
  }

  async replacePrimaryEmail(id: InternalIdentity, email: string) {
    await this.pg.tx(async (tx) => {
      await tx.do(sql`
        UPDATE payer_emails
        SET priority = 'default', updated_at = NOW()
        WHERE payer_id = ${id.value} AND priority = 'primary'
      `);

      await tx.do(sql`
        INSERT INTO payer_emails (payer_id, priority, email)
        VALUES (${id.value}, 'primary', ${email})
      `)
    })
  }

  async createPayerProfileFromTkoalyUser(user: UpstreamUser): Promise<PayerProfile> {
    const existingPayerProfile = await this.getPayerProfileByTkoalyIdentity(tkoalyIdentity(user.id))

    if (existingPayerProfile) {
      const emails = await this.getPayerEmails(existingPayerProfile.id)

      if (!emails.some(({ email }) => email === user.email)) {
        await this.replacePrimaryEmail(existingPayerProfile.id, user.email)

        if (existingPayerProfile.stripeCustomerId) {
          /*await this.stripe.customers.update(existingPayerProfile.stripeCustomerId, {
            email: user.email,
          })*/
        }
      }

      return existingPayerProfile
    }

    const existingEmailProfile = await this.getPayerProfileByEmailIdentity(emailIdentity(user.email))

    if (existingEmailProfile) {
      await this.pg
        .one<DbPayerProfile>(sql`
          UPDATE payer_profiles
          SET tkoaly_user_id = ${user.id}
          WHERE id = ${existingEmailProfile.id.value}
       `)

      return {
        ...existingEmailProfile,
        tkoalyUserId: tkoalyIdentity(user.id),
      }
    }

    const dbPayerProfile = await this.pg
      .one<DbPayerProfile>(sql`
        INSERT INTO payer_profiles (tkoaly_user_id, name)
        VALUES (${user.id}, ${user.screenName})
        RETURNING *
      `)

    if (!dbPayerProfile) {
      throw new Error('Could not create payer profile')
    }

    const dbPayerEmail = await this.pg.one<DbPayerEmail>(sql`
      INSERT INTO payer_emails (payer_id, email, priority, source)
      VALUES (${dbPayerProfile.id}, ${user.email}, 'primary', 'tkoaly')
      RETURNING *
    `)

    if (!dbPayerEmail) {
      throw new Error('Could not create email record for payer profile')
    }

    return formatPayerProfile({
      ...dbPayerProfile,
      emails: [dbPayerEmail],
    })
  }

  async setProfileTkoalyIdentity(id: PayerIdentity, account: TkoalyIdentity) {
    await this.pg.any(sql`
      UPDATE payer_profiles
      SET tkoaly_user_id = ${account.value}
      WHERE id = ${id.value}
    `)
  }

  async getPaymentMethod(id: PayerIdentity) {
    const payerProfile = await this.getPayerProfileByIdentity(id)

    if (!payerProfile) {
      return null;
    }

    const paymentMethod = await this.pg
      .one<DbPaymentMethod>(
        sql`SELECT * FROM payment_methods WHERE payer_id = ${payerProfile.id.value} `
      )

    if (!paymentMethod) {
      return null
    }

    return formatPaymentMethod(paymentMethod)
  }

  /*async getSetupIntentForUser(id: PayerIdentity) {
    const payerProfile = await this.getPayerProfileByIdentity(id)

    if (!payerProfile) {
      throw new Error('Payer profile not found')
    }

    await this.stripe.setupIntents.list({
      customer: payerProfile.stripeCustomerId,
    })

    const setupIntent = await this.stripe.setupIntents.create({
      customer: payerProfile.stripeCustomerId,
      usage: 'off_session',
      payment_method_types: ['card'],
    })

    return { secret: setupIntent.client_secret }
  }*/

  /*async setPaymentMethod(setupIntentId: string) {
    const setupIntent = await this.stripe.setupIntents.retrieve(setupIntentId)

    if (!setupIntent.payment_method) {
      throw new Error('Payment method not found')
    }

    const payerProfileId = await this.pg
      .one<{ id: string }>(
        sql`SELECT id FROM payer_profiles WHERE stripe_customer_id = ${setupIntent.customer} `
      )
      .then(res => res?.id ?? null)

    if (!payerProfileId) {
      throw new Error('Payer profile not found')
    }

    const paymentMethod = await this.stripe.paymentMethods.retrieve(
      setupIntent.payment_method.toString()
    )

    if (!paymentMethod) {
      throw new Error('No payment method found')
    }

    await this.pg.any(sql`
      INSERT INTO payment_methods(payer_id, stripe_pm_id, brand, last4, exp_month, exp_year)
      VALUES(
        ${payerProfileId},
        ${paymentMethod.id},
        ${paymentMethod.card?.brand},
        ${paymentMethod.card?.last4},
        ${paymentMethod.card?.exp_month},
        ${paymentMethod.card?.exp_year}
      ) ON CONFLICT(payer_id) DO UPDATE
        SET stripe_pm_id = ${paymentMethod.id},
          brand = ${paymentMethod.card?.brand},
          last4 = ${paymentMethod.card?.last4},
          exp_month = ${paymentMethod.card?.exp_month},
          exp_year = ${paymentMethod.card?.exp_year},
          updated_at = NOW()
    `)
  }*/

  async getEventsWithPaymentStatus(id: PayerIdentity, registeredEvents: Event[]): Promise<EventWithPaymentStatus[]> {
    const payerProfile = await this.getPayerProfileByIdentity(id)

    if (!payerProfile) {
      return []
    }

    const paidEvents = await this.pg.any<{
      payment_status: PaymentStatus
      event_id: number
      created_at: Date
    }>(sql`
      SELECT
        p.payment_status,
        li.event_id,
        p.created_at
      FROM payments p
      INNER JOIN line_items li ON li.payment_id = p.id
      WHERE p.payer_id = ${payerProfile.id.value}
      AND p.payment_status = 'succeeded'
      GROUP BY li.event_id, p.payment_status, p.created_at
    `)

    return registeredEvents
      .filter(e => e.price !== null)
      .map(event => {
        const paymentStatus =
          paidEvents.find(paidEvent => paidEvent.event_id === event.id) ?? null
        return {
          ...event,
          payment: paymentStatus
            ? {
              status: paymentStatus.payment_status,
              createdAt: paymentStatus.created_at,
            }
            : null,
        }
      })
  }

  updatePaymentStatus(paymentIntentId: string, status: PaymentStatus) {
    return this.pg.any(sql`
      UPDATE payments
      SET payment_status = ${status},
          updated_at = NOW()
      WHERE stripe_payment_intent_id = ${paymentIntentId}
    `)
  }

  async mergeProfiles(primary: InternalIdentity, secondary: InternalIdentity) {
    await this.pg.tx(async (tx) => {
      await tx.do(sql`
        UPDATE payer_profiles
        SET disabled = true, merged_to = ${primary.value}
        WHERE id = ${secondary.value}
      `)

      await tx.do(sql`
        INSERT INTO payer_emails (payer_id, email, priority, source)
        SELECT ${primary.value} AS payer_id, email, CASE WHEN priority = 'primary' THEN 'default' ELSE priority END AS priority, source
        FROM payer_emails
        WHERE payer_id = ${secondary.value}
      `)
    })
  }
}
