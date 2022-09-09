import * as t from 'io-ts'
import * as Either from 'fp-ts/lib/Either'
import { flow, pipe } from 'fp-ts/lib/function'
import { FromDbType } from '../backend/db'
import { EuroValue, euro } from './currency'
import { isMatch } from 'date-fns'
import { split } from 'fp-ts/lib/string'
import { reduce, reverse } from 'fp-ts/lib/ReadonlyNonEmptyArray'
import { foldW } from 'fp-ts/lib/Either'
export { EuroValue, euro }

export type TkoAlyUserId = {
  type: 'upstream'
  id: number
}

export const tkoalyIdentity = (id: number): TkoalyIdentity => ({
  type: 'tkoaly',
  value: id,
})

export const emailIdentity = (id: string): EmailIdentity => ({
  type: 'email',
  value: id,
})

export const internalIdentity = (id: string): InternalIdentity => ({
  type: 'internal',
  value: id,
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

const isNonEmpty = <T>(a: T[]): a is [T, ...T[]] => a.length > 0

export const nonEmptyArray = <T>(rootType: t.Type<T, T, unknown>) =>
  new t.Type<[T, ...T[]], T[], unknown>(
    'nonEmptyArray',
    (u): u is [T, ...T[]] => Array.isArray(u) && u.length > 0,
    (input, context) =>
      pipe(
        t.array(rootType).validate(input, context),
        Either.chain(value =>
          !isNonEmpty(value)
            ? Either.left([
              {
                key: '',
                type: 'array.minLength',
                message: 'Array is empty',
                context,
                value,
              },
            ])
            : Either.right(value)
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

export type TkoalyIdentity = {
  type: 'tkoaly',
  value: number,
}

export type EmailIdentity = {
  type: 'email',
  value: string,
}

export type InternalIdentity = {
  type: 'internal',
  value: string,
}

export function isTkoalyIdentity(id: PayerIdentity): id is TkoalyIdentity {
  return id.type === 'tkoaly';
}

export function isInternalIdentity(id: PayerIdentity): id is InternalIdentity {
  return id.type === 'internal';
}

export function isEmailIdentity(id: PayerIdentity): id is EmailIdentity {
  return id.type === 'email';
}

export type ExternalIdentity = TkoalyIdentity | EmailIdentity
export type PayerIdentity = ExternalIdentity | InternalIdentity

export type UpstreamUserRole = 'kayttaja' | 'virkailija' | 'tenttiarkistovirkailija' | 'jasenvirkailija' | 'yllapitaja'

export type UpstreamUser = {
  id: number
  screenName: string
  email: string
  username: string
  role: UpstreamUserRole
}

export type DbPayerProfile = {
  id: string
  tkoaly_user_id?: number
  email: string
  stripe_customer_id: string
  created_at: Date
  updated_at: Date
  name: string
}
export type PayerProfile = Omit<
  FromDbType<DbPayerProfile>,
  'id' | 'tkoalyUserId'
> & {
  id: InternalIdentity
  tkoalyUserId?: TkoalyIdentity
}

export const payerPreferences = t.type({
  uiLanguage: t.union([t.literal('fi'), t.literal('en')]),
  emailLanguage: t.union([t.literal('fi'), t.literal('en')]),
})

export type PayerPreferences = t.TypeOf<typeof payerPreferences>

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
  payerId: InternalIdentity
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
  payerId: null | string
  paymentMethod: Pick<PaymentMethod, 'id' | 'brand' | 'last4'>
  user: TokenPayload
  preferences: PayerPreferences
}

export type DbPayment = {
  id: string
  payer_id: string
  payment_status: PaymentStatus
  stripe_payment_intent_id: string
  created_at: Date
  updated_at: Date
  payment_number: number
  data: unknown
}

/*export type Payment = Omit<FromDbType<DbPayment>, 'payer_id'> & {
  payerId: InternalIdentity
}*/

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

export type DbDebtCenter = {
  id: string
  name: string
  description: string
  url: string
  created_at: Date
  updated_at: Date
}

export type DebtCenter = FromDbType<DbDebtCenter>

export type NewDebtCenter = Omit<DebtCenter, 'id' | 'createdAt' | 'updatedAt'>

export type DbDebtComponent = {
  id: string
  name: string
  value?: string
  amount: number
  description: string
  debt_center_id: string
  created_at: Date
  updated_at: Date
}

export type DebtComponent = Omit<FromDbType<DbDebtComponent>, 'amount'> & { amount: EuroValue }

export type NewDebtComponent = Omit<DebtComponent, 'id' | 'createdAt' | 'updatedAt' | 'amount'> & { amount: EuroValue }

export type DbDebtComponentMapping = {
  component_id: string
  debt_id: string
}

export type DbDebt = {
  id: string
  name: string
  due_date: string
  draft: boolean
  payer_id: string
  debt_center_id: string
  description: string
  created_at: Date
  updated_at: Date
  status: string
}

export type DebtStatus = 'paid' | 'unpaid' | 'mispaid'

export type Debt = Omit<FromDbType<DbDebt>, 'payerId'> & { payerId: InternalIdentity, status: DebtStatus, debtComponents: Array<DebtComponent> };

export type DebtWithPayer = Debt & { payer: PayerProfile };

export type DebtComponentDetails = { debtComponents: DebtComponent[] }

export interface DateBrand {
  readonly Date: unique symbol
}

export const dateString = t.brand(
  t.string,
  (n): n is t.Branded<string, DateBrand> => isMatch(n, 'd.M.yyyy'),
  'Date',
)

export type DateString = t.TypeOf<typeof dateString>

interface DbDateBrand {
  readonly DbDate: unique symbol
}

export const dbDateString = t.brand(
  t.string,
  (n): n is t.Branded<string, DbDateBrand> => isMatch(n, 'yyyy-MM-dd'),
  'DbDate',
)

export type DbDateString = t.TypeOf<typeof dbDateString>

export type NewDebt = {
  centerId?: string
  description: string
  components: string[]
  name: string
  payer: PayerIdentity
  dueDate: DbDateString,
}

export const convertToDbDate: (date: DateString) => DbDateString | null = flow(
  split('.'),
  reverse,
  reduce(null as (string | null), (a, p) => a === null ? p : a + '-' + p),
  dbDateString.decode,
  foldW(() => null, (a) => a)
)

export type ApiRegistration = {
  id: number
  user_id: number
  name: string
  email: string
  phone: string
  answers: { question_id: number, question: string, answer: string }[]
}

export type Registration = Omit<FromDbType<ApiRegistration>, 'userId'> & { userId: TkoalyIdentity }

export type ApiCustomField = {
  id: number
  name: string
  type: 'text' | 'textarea' | 'radio' | 'checkbox'
  options: string[]
}

export type CustomField = ApiCustomField

export type PayerEmailPriority = 'primary' | 'disabled' | 'default'

export type DbPayerEmail = {
  payer_id: string
  email: string
  priority: PayerEmailPriority
  source: 'tkoaly' | 'other' | 'user'
  created_at: Date
  updated_at: Date
}

export type PayerEmail = Omit<FromDbType<DbPayerEmail>, 'payerId'> & { payerId: InternalIdentity }

export type Payment = {
  id: string,
  payment_number: number,
  type: 'invoice',
  data: object | null,
  message: string,
  created_at: Date,
  balance: number,
  status: 'paid' | 'canceled' | 'mispaid' | 'unpaid',
  updated_at: Date
}

export type DbEmail = {
  id: string
  recipient: string
  subject: string
  template: string
  html: string | null
  text: string
  draft: boolean
  created_at: Date
  sent_at: Date | null
}

export type Email = FromDbType<DbEmail>
