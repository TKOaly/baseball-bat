import { Stripe } from 'stripe'
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
} from '../../common/types'
import { appendAll, PgClient } from '../db'
import sql from 'sql-template-strings'
import { EventsService } from './events'
import * as R from 'remeda'
import { Inject, Service } from 'typedi'
import { UsersService } from './users'

function assertNever(_value: never) {
  throw new Error('Should-be unreachable code reached')
}

export const formatPayerProfile = (profile: DbPayerProfile): PayerProfile => ({
  id: internalIdentity(profile.id),
  tkoalyUserId: profile.tkoaly_user_id === undefined
    ? undefined
    : tkoalyIdentity(profile.tkoaly_user_id),
  email: profile.email,
  name: profile.name,
  stripeCustomerId: profile.stripe_customer_id,
  createdAt: profile.created_at,
  updatedAt: profile.updated_at,
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

  @Inject('stripe')
  stripe: Stripe

  @Inject(() => EventsService)
  eventsService: EventsService

  @Inject(() => UsersService)
  usersService: UsersService

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

  async getPayerProfileByTkoalyIdentity(id: TkoalyIdentity) {
    const dbProfile = await this.pg.one<DbPayerProfile>(
      sql`SELECT * FROM payer_profiles WHERE tkoaly_user_id = ${id.value}`
    )

    if (dbProfile) {
      return formatPayerProfile(dbProfile)
    }

    return null
  }

  async getPayerProfileByInternalIdentity(id: InternalIdentity) {
    const dbProfile = await this.pg.one<DbPayerProfile>(
      sql`SELECT * FROM payer_profiles WHERE id = ${id.value}`
    )

    if (dbProfile) {
      return formatPayerProfile(dbProfile)
    }

    return null
  }

  async getPayerProfileByEmailIdentity(id: EmailIdentity) {
    const dbProfile = await this.pg.one<DbPayerProfile>(sql`
      SELECT p.*
      FROM payer_emails e
      JOIN payer_profiles p ON p.id = e.payer_id
      WHERE e.email = ${id.value}
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


  async createPayerProfileForExternalIdentity(id: ExternalIdentity, token?: string): Promise<PayerProfile | null> {
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
      return this.createPayerProfileFromEmailIdentity(id);
    }

    return assertNever(id) as any
  }

  async createPayerProfileFromTkoalyIdentity(id: TkoalyIdentity, token: string) {
    const upstreamUser = await this.usersService.getUpstreamUserById(id.value, token)
    return this.createPayerProfileFromTkoalyUser(upstreamUser)
  }

  async createPayerProfileFromEmailIdentity(id: EmailIdentity) {
    const payerProfile = await this.pg
      .one<DbPayerProfile>(sql`INSERT INTO payer_profiles DEFAULT VALUES RETURNING *`)

    if (!payerProfile) {
      throw new Error('Could not create a new payer profile')
    }

    this.pg.any(sql`
      INSERT INTO payer_emails (email, payer_id, priority)
      VALUES (${id.value}, ${payerProfile.id}, 'primary')
    `)

    return formatPayerProfile(payerProfile)
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

  async createPayerProfileFromTkoalyUser(user: UpstreamUser) {
    const existingPayerProfile = await this.getPayerProfileByTkoalyIdentity(tkoalyIdentity(user.id))

    if (existingPayerProfile) {
      const emails = await this.getPayerEmails(existingPayerProfile.id)

      if (!emails.some(({ email }) => email === user.email)) {
        console.log('Replacing email!')
        await this.replacePrimaryEmail(existingPayerProfile.id, user.email)

        if (existingPayerProfile.stripeCustomerId) {
          await this.stripe.customers.update(existingPayerProfile.stripeCustomerId, {
            email: user.email,
          })
        }
      }

      return existingPayerProfile
    }

    const existingEmailProfile = await this.getPayerProfileByEmailIdentity(emailIdentity(user.email))

    if (existingEmailProfile) {
      console.log('Existing ' + user.email)
      return await this.pg
        .one<DbPayerProfile>(sql`
          UPDATE payer_profiles
          SET tkoaly_user_id = ${user.id}
          WHERE id = ${existingEmailProfile.id.value}
       `)
        .then(dbProfile => dbProfile && formatPayerProfile(dbProfile))
    }

    const payerProfile = await this.pg
      .one<DbPayerProfile>(
        sql`INSERT INTO payer_profiles (tkoaly_user_id, name)
          VALUES (${user.id}, ${user.screenName})
          RETURNING *`
      )
      .then(dbProfile => dbProfile && formatPayerProfile(dbProfile))

    if (payerProfile) {
      await this.pg.any(sql`
        INSERT INTO payer_emails (payer_id, email, priority, source)
        VALUES (${payerProfile.id.value}, ${user.email}, 'primary', 'tkoaly')
      `)
    }

    return payerProfile
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

  async getSetupIntentForUser(id: PayerIdentity) {
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
  }

  async setPaymentMethod(setupIntentId: string) {
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
  }

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

  async payUsersEvents(
    eventsToPay: number[],
    id: PayerIdentity
  ) {
    const payerProfile = await this.getPayerProfileByIdentity(id)

    if (!payerProfile) {
      throw new Error('Payer profile not found')
    }

    if (!payerProfile.tkoalyUserId) {
      throw new Error('unimplemented')
    }

    const paidEvents = await this.pg
      .any<{ eventId: number }>(
        sql`SELECT li.event_id as "eventId" FROM line_items li
          INNER JOIN payments p ON p.id = li.payment_id
          WHERE p.payer_id = ${payerProfile.id.value}
          GROUP BY li.event_id`
      )
      .then(res => res.map(r => r.eventId))

    const payableEvents = R.difference(eventsToPay, paidEvents)
    const events = await this.eventsService
      .getEvents(payerProfile.tkoalyUserId)
      .then(events => events.filter(e => payableEvents.includes(e.id)))

    const sum = events.reduce((acc, event) => acc + event.price?.value!, 0)

    const paymentMethod = await this.getPaymentMethod(id)

    if (!paymentMethod) {
      throw new Error('Payment method not found')
    }

    const paymentIntent = await this.stripe.paymentIntents.create({
      amount: sum,
      currency: 'eur',
      customer: payerProfile.stripeCustomerId,
      payment_method: paymentMethod.stripePaymentMethodId,
      off_session: true,
      confirm: true,
      metadata: {
        events: JSON.stringify(
          events.map(e => ({
            id: e.id,
            name: e.name,
            price: e.price?.value,
          }))
        ),
      },
    })

    this.pg.any(sql`
      WITH payment AS (
        INSERT INTO payments(payer_id, payment_status, stripe_payment_intent_id)
        VALUES (
          ${payerProfile.id},
          ${paymentIntent.status ?? 'processing'},
          ${paymentIntent.id}
        )
        RETURNING id
      )
      INSERT INTO line_items(payment_id, event_id, amount, item_name)
      VALUES`.append(
      appendAll(
        events,
        e => sql`(
  (SELECT id FROM payment),
  ${e.id},
                    ${e.price?.value},
                    ${`${e.name} - Attendance`}
                  )`,
        ','
      )
    )
    )
  }

  updatePaymentStatus(paymentIntentId: string, status: PaymentStatus) {
    return this.pg.any(sql`
      UPDATE payments
      SET payment_status = ${status},
          updated_at = NOW()
      WHERE stripe_payment_intent_id = ${paymentIntentId}
    `)
  }
}
