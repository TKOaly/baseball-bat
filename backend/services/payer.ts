import { Stripe } from 'stripe'
import {
  DbPayerProfile,
  DbPaymentMethod,
  Event,
  EventWithPaymentStatus,
  PayerProfile,
  PaymentMethod,
  PaymentStatus,
  TkoAlyUserId,
  tkoAlyUserId,
  UpstreamUser,
  userId,
  UserId,
} from '../../common/types'
import { appendAll, PgClient } from '../db'
import sql from 'sql-template-strings'
import { EventsService } from './events'
import * as R from 'remeda'

const formatPayerProfile = (profile: DbPayerProfile): PayerProfile => ({
  id: userId(profile.id),
  upstreamId: tkoAlyUserId(profile.upstream_id),
  email: profile.email,
  stripeCustomerId: profile.stripe_customer_id,
  createdAt: profile.created_at,
  updatedAt: profile.updated_at,
})

const formatPaymentMethod = (method: DbPaymentMethod): PaymentMethod => ({
  id: method.id,
  payerId: userId(method.payer_id),
  stripePaymentMethodId: method.stripe_pm_id,
  brand: method.brand,
  last4: method.last4,
  expMonth: method.exp_month,
  expYear: method.exp_year,
  createdAt: method.created_at,
  updatedAt: method.updated_at,
})

export const getPayerProfileByUpstream = (pg: PgClient, { id }: TkoAlyUserId) =>
  pg
    .one<DbPayerProfile>(
      sql`SELECT * FROM payer_profiles WHERE upstream_id = ${id}`
    )
    .then(dbProfile => dbProfile && formatPayerProfile(dbProfile))

export const createPayerProfile = async (
  pg: PgClient,
  stripe: Stripe,
  user: UpstreamUser
) => {
  const existingPayerProfile = await getPayerProfileByUpstream(
    pg,
    tkoAlyUserId(user.id)
  )

  if (existingPayerProfile) {
    if (existingPayerProfile.email !== user.email) {
      await stripe.customers.update(existingPayerProfile.stripeCustomerId, {
        email: user.email,
      })

      return pg
        .one<DbPayerProfile>(
          sql`UPDATE payer_profiles
                SET email = ${user.email},
                    updated_at = NOW()
              WHERE upstream_id = ${user.id} RETURNING *`
        )
        .then(dbProfile => dbProfile && formatPayerProfile(dbProfile))
    }

    return existingPayerProfile
  }

  const newStripeCustomer = await stripe.customers.create({
    email: user.email,
  })

  return pg
    .one<DbPayerProfile>(
      sql`INSERT INTO payer_profiles (upstream_id, email, stripe_customer_id)
          VALUES (${user.id}, ${user.email}, ${newStripeCustomer.id})
          RETURNING *`
    )
    .then(dbProfile => dbProfile && formatPayerProfile(dbProfile))
}

export const getPayerProfile = (pg: PgClient, { id }: UserId) =>
  pg
    .one<DbPayerProfile>(sql`SELECT * FROM payer_profiles WHERE id = ${id}`)
    .then(dbProfile => dbProfile && formatPayerProfile(dbProfile))

export const getPaymentMethod = (pg: PgClient, { id }: UserId) =>
  pg
    .one<DbPaymentMethod>(
      sql`SELECT * FROM payment_methods WHERE payer_id = ${id}`
    )
    .then(paymentMethod => paymentMethod && formatPaymentMethod(paymentMethod))

export const getSetupIntentForUser = async (
  pg: PgClient,
  stripe: Stripe,
  id: UserId
) => {
  const payerProfile = await getPayerProfile(pg, id)

  if (!payerProfile) {
    throw new Error('Payer profile not found')
  }

  await stripe.setupIntents.list({
    customer: payerProfile.stripeCustomerId,
  })

  const setupIntent = await stripe.setupIntents.create({
    customer: payerProfile.stripeCustomerId,
    usage: 'off_session',
    payment_method_types: ['card'],
  })

  return { secret: setupIntent.client_secret }
}

export const setPaymentMethod = async (
  pg: PgClient,
  stripe: Stripe,
  setupIntentId: string
) => {
  const setupIntent = await stripe.setupIntents.retrieve(setupIntentId)

  if (!setupIntent.payment_method) {
    throw new Error('Payment method not found')
  }

  const payerProfileId = await pg
    .one<{ id: string }>(
      sql`SELECT id FROM payer_profiles WHERE stripe_customer_id = ${setupIntent.customer}`
    )
    .then(res => res?.id ?? null)

  if (!payerProfileId) {
    throw new Error('Payer profile not found')
  }

  const paymentMethod = await stripe.paymentMethods.retrieve(
    setupIntent.payment_method.toString()
  )

  if (!paymentMethod) {
    throw new Error('No payment method found')
  }

  await pg.any(
    sql`INSERT INTO payment_methods (payer_id, stripe_pm_id, brand, last4, exp_month, exp_year)
        VALUES (
          ${payerProfileId},
          ${paymentMethod.id},
          ${paymentMethod.card?.brand},
          ${paymentMethod.card?.last4},
          ${paymentMethod.card?.exp_month},
          ${paymentMethod.card?.exp_year}
        ) ON CONFLICT (payer_id) DO UPDATE
          SET stripe_pm_id = ${paymentMethod.id},
              brand = ${paymentMethod.card?.brand},
              last4 = ${paymentMethod.card?.last4},
              exp_month = ${paymentMethod.card?.exp_month},
              exp_year = ${paymentMethod.card?.exp_year},
              updated_at = NOW()`
  )
}

export const getEventsWithPaymentStatus = async (
  pg: PgClient,
  { id }: UserId,
  registeredEvents: Event[]
): Promise<EventWithPaymentStatus[]> => {
  const paidEvents = await pg.any<{
    payment_status: PaymentStatus
    event_id: number
    created_at: Date
  }>(
    sql`SELECT
          p.payment_status,
          li.event_id,
          p.created_at
        FROM payments p
        INNER JOIN line_items li ON li.payment_id = p.id
        WHERE p.payer_id = ${id}
        AND p.payment_status = 'succeeded'
        GROUP BY li.event_id, p.payment_status, p.created_at`
  )

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

export const payUsersEvents = async (
  pg: PgClient,
  stripe: Stripe,
  eventsService: EventsService,
  eventsToPay: number[],
  userId: UserId
) => {
  const payerProfile = await getPayerProfile(pg, userId)

  if (!payerProfile) {
    throw new Error('Payer profile not found')
  }

  const paidEvents = await pg
    .any<{ eventId: number }>(
      sql`SELECT li.event_id as "eventId" FROM line_items li
          INNER JOIN payments p ON p.id = li.payment_id
          WHERE p.payer_id = ${userId.id}
          GROUP BY li.event_id`
    )
    .then(res => res.map(r => r.eventId))

  const payableEvents = R.difference(eventsToPay, paidEvents)
  const events = await eventsService
    .getEvents(payerProfile.upstreamId)
    .then(events => events.filter(e => payableEvents.includes(e.id)))

  const sum = events.reduce((acc, event) => acc + event.price?.value!, 0)

  const paymentMethod = await getPaymentMethod(pg, userId)

  if (!paymentMethod) {
    throw new Error('Payment method not found')
  }

  const paymentIntent = await stripe.paymentIntents.create({
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

  pg.any(
    sql`WITH payment AS (
          INSERT INTO payments (payer_id, payment_status, stripe_payment_intent_id)
          VALUES (
            ${userId.id},
            ${paymentIntent.status ?? 'processing'},
            ${paymentIntent.id}
          )
          RETURNING id
        )
        INSERT INTO line_items (payment_id, event_id, amount, item_name)
        VALUES `.append(
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
