import { Stripe } from 'stripe'
import {
  DbPayerProfile,
  DbPaymentMethod,
  PayerProfile,
  PaymentMethod,
  TkoAlyUserId,
  tkoAlyUserId,
  UpstreamUser,
  userId,
  UserId,
} from '../../common/types'
import { PgClient } from '../db'
import sql from 'sql-template-strings'
import * as Arr from 'fp-ts/Array'
import * as Option from 'fp-ts/Option'

const createOrGetStripeCustomer = (stripe: Stripe, email: string) =>
  stripe.customers
    .list({ email })
    .then(({ data }) => data)
    .then(Arr.lookup(0))
    .then(
      Option.fold(
        () => stripe.customers.create({ email }),
        customer => Promise.resolve(customer)
      )
    )

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
    .one<DbPaymentMethod>(sql`SELECT * FROM payment_methods WHERE id = ${id}`)
    .then(paymentMethod => paymentMethod && formatPaymentMethod)
