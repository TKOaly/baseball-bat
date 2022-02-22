import * as t from 'io-ts'
import * as Either from 'fp-ts/lib/Either'
import { pipe } from 'fp-ts/lib/function'
import { FromDbType } from '../backend/db'
import { string } from 'fp-ts'

export type TkoAlyUserId = {
  type: 'upstream'
  id: number
}

export const tkoAlyUserId = (id: number): TkoAlyUserId => ({
  type: 'upstream',
  id,
})

export type UserId = {
  type: 'local'
  id: string
}

export const userId = (id: string): UserId => ({
  type: 'local',
  id,
})

export type EuroValue = {
  currency: 'eur'
  value: number
}

export const euro = (value: number): EuroValue => ({
  currency: 'eur',
  value: value * 100,
})

export const numberFromString = new t.Type<number, string, unknown>(
  'numberFromString',
  t.number.is,
  (input, context) =>
    pipe(
      t.string.validate(input, context),
      Either.chain(value =>
        value.length === 0 || value === null
          ? Either.left([])
          : t.number.decode(Number(value) || null)
      )
    ),
  String
)

export const nonEmptyArray = <T>(rootType: t.Type<T, T, unknown>) =>
  new t.Type<[T, ...T[]], T[], unknown>(
    'nonEmptyArray',
    (mt): mt is [T, ...T[]] => Array.isArray(mt) && mt.length > 0,
    (input, context) =>
      pipe(
        t.array(rootType).validate(input, context),
        Either.chain(value =>
          value.length === 0
            ? Either.left([
                {
                  key: '',
                  type: 'array.minLength',
                  message: 'Array is empty',
                  context,
                  value,
                },
              ])
            : Either.right(value as [T, ...T[]])
        )
      ),
    arr => arr
  )

export type PaymentStatus =
  | 'requires_payment_method'
  | 'requires_confirmation'
  | 'requires_action'
  | 'processing'
  | 'requires_capture'
  | 'canceled'
  | 'succeeded'

export type Event = {
  id: number
  name: string
  starts: Date
  registrationStarts: Date
  registrationEnds: Date
  cancellationStarts: Date
  cancellationEnds: Date
  location: string
  deleted: boolean
  price: EuroValue | null
}

export type EventWithPaymentStatus = Event & {
  payment: {
    status: PaymentStatus
    createdAt: Date
  } | null
}

export type ApiEvent = {
  id: 1078
  name: string
  starts: string
  registration_starts: string
  registration_ends: string
  cancellation_starts: string
  cancellation_ends: string
  location: string
  deleted: 0 | 1
  price: string
}

export type UpstreamUser = {
  id: number
  screenName: string
  email: string
}

export type DbPayerProfile = {
  id: string
  upstream_id: number
  email: string
  stripe_customer_id: string
  created_at: Date
  updated_at: Date
}
export type PayerProfile = Omit<
  FromDbType<DbPayerProfile>,
  'id' | 'upstreamId'
> & {
  id: UserId
  upstreamId: TkoAlyUserId
}

export type DbPaymentMethod = {
  id: string
  payer_id: string
  stripe_pm_id: string
  brand: string
  last4: string
  exp_month: number
  exp_year: number
  created_at: Date
  updated_at: Date
}
export type PaymentMethod = Omit<
  FromDbType<DbPaymentMethod>,
  'payerId' | 'stripePmId'
> & {
  payerId: UserId
  stripePaymentMethodId: string
}

export const TokenPayload = t.type({
  id: t.string,
  upstreamId: t.number,
  email: t.string,
  screenName: t.string,
})

export type TokenPayload = t.TypeOf<typeof TokenPayload>

export type Session = {
  payerProfile: PayerProfile
  paymentMethod: Pick<PaymentMethod, 'id' | 'brand' | 'last4'>
  user: TokenPayload
}

export type DbPayment = {
  id: string
  payer_id: string
  payment_status: PaymentStatus
  stripe_payment_intent_id: string
  created_at: Date
  updated_at: Date
}

export type Payment = Omit<FromDbType<DbPayment>, 'payer_id'> & {
  payerId: UserId
}

export type DbLineItem = {
  id: string
  payment_id: string
  event_id: number
  event_item_id: number
  amount: number
  currency: string
  item_name: string
  created_at: Date
  updated_at: Date
}

export type LineItem = Omit<FromDbType<DbLineItem>, 'amount'> & {
  amount: EuroValue
}
