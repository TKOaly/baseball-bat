import * as t from 'io-ts'
import * as Either from 'fp-ts/lib/Either'
import { flow, pipe } from 'fp-ts/lib/function'
import { FromDbType } from '../backend/db'
import { EuroValue, euro, euroValue } from './currency'
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

export const tkoalyIdentityT = t.type({
  type: t.literal('tkoaly'),
  value: t.number,
})

export const emailIdentityT = t.type({
  type: t.literal('email'),
  value: t.string,
})

export const internalIdentityT = t.type({
  type: t.literal('internal'),
  value: t.string,
})

export type TkoalyIdentity = t.TypeOf<typeof tkoalyIdentityT>
export type EmailIdentity = t.TypeOf<typeof emailIdentityT>
export type InternalIdentity = t.TypeOf<typeof internalIdentityT>

export const payerIdentity = t.union([
  emailIdentityT,
  tkoalyIdentityT,
  internalIdentityT,
])

export type PayerIdentity = t.TypeOf<typeof payerIdentity>

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
  disabled: boolean
  merged_to: string
  paid_count?: number
  unpaid_count?: number
  debt_count?: number
  total?: number
}
export type PayerProfile = Omit<
  FromDbType<DbPayerProfile>,
  'id' | 'tkoalyUserId' | 'mergedTo' | 'total'
> & {
  id: InternalIdentity
  tkoalyUserId?: TkoalyIdentity
  mergedTo?: InternalIdentity
  emails: PayerEmail[]
  total?: EuroValue
}

export const payerPreferences = t.type({
  uiLanguage: t.union([t.literal('fi'), t.literal('en')]),
  emailLanguage: t.union([t.literal('fi'), t.literal('en')]),
  hasConfirmedMembership: t.boolean,
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
  credited: boolean
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

export type DbDebtCenter = {
  paid_count?: number
  unpaid_count?: number
  debt_count?: number
  id: string
  name: string
  description: string
  url: string
  created_at: Date
  updated_at: Date
  total?: number
}

export type DebtCenter = Omit<FromDbType<DbDebtCenter>, 'total'> & { total?: EuroValue }

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
  last_reminded: Date | null
  due_date: Date
  draft: boolean
  published_at: Date | null
  payer_id: string
  debt_center_id: string
  description: string
  created_at: Date
  updated_at: Date
  status: DebtStatus
  credited: boolean
}

export type DebtStatus = 'paid' | 'unpaid' | 'mispaid'

export type Debt = Omit<FromDbType<DbDebt>, 'payerId' | 'total'> & { total?: EuroValue, payerId: InternalIdentity, status: DebtStatus, debtComponents: Array<DebtComponent> };

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
  createdAt?: Date
}

export type DebtPatch = {
  id: string
  name?: string
  description?: string
  payerId?: PayerIdentity
  dueDate?: Date
  centerId?: string
  components?: string[]
}

export type DebtCenterPatch = {
  id: string
  name: string
  description: string
  url: string
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
  payer_id: string,
  title: string,
  created_at: Date,
  balance: number,
  credited: boolean
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

export const bankAccount = t.type({
  iban: t.string,
  name: t.string,
})

export type BankAccount = t.TypeOf<typeof bankAccount>

export type DbBankTransaction = {
  id: string
  account: string
  amount: number
  value_time: Date
  type: 'credit' | 'debit'
  other_party_account: string | null
  other_party_name: string
  reference: string | null
  message: string | null
  payment?: DbPayment
}

export type BankTransaction = Omit<FromDbType<DbBankTransaction>, 'amount' | 'otherPartyAccount' | 'otherPartyName' | 'valueTime'> & {
  amount: EuroValue
  date: Date
  otherParty: {
    name: string
    account: string | null
  }
}

type Explode<T> = keyof T extends infer K
  ? K extends unknown
  ? { [I in keyof T]: I extends K ? T[I] : never }
  : never
  : never;

type AtMostOne<T> = Explode<Partial<T>>;
type AtLeastOne<T, U = { [K in keyof T]: Pick<T, K> }> = Partial<T> & U[keyof U]
type ExactlyOne<T> = AtMostOne<T> & AtLeastOne<T>

const exactlyOne = <T extends t.Props>(props: T) => new t.Type<
  ExactlyOne<{ [K in keyof T]: t.TypeOf<T[K]> }>,
  ExactlyOne<{ [K in keyof T]: t.TypeOf<T[K]> }>,
  unknown
>(
  'exactlyOne',
  (input: unknown): input is ExactlyOne<T> => {
    if (typeof input !== 'object' || input === null) {
      return false;
    }

    const keys = Object.keys(input);

    if (keys.length !== 1) {
      return false;
    }

    if (!(keys[0] in props)) {
      return false;
    }

    return true;
  },
  (input, context) => {
    if (typeof input !== 'object' || input === null) {
      return t.failure(input, context);
    }

    const keys = Object.keys(input);

    if (keys.length !== 1) {
      return t.failure(input, context);
    }

    if (!(keys[0] in props)) {
      return t.failure(input, context);
    }

    return t.success(input as ExactlyOne<T>);
  },
  t.identity,
)


const newBankTransaction = t.intersection([
  t.type({
    id: t.string,
    amount: euroValue,
    date: t.unknown,
    type: t.union([t.literal('credit'), t.literal('debit')]),
    otherParty: t.intersection([
      t.partial({ account: t.union([t.null, t.string]) }),
      t.type({ name: t.string }),
    ]),
  }),
  t.partial({
    message: t.union([t.string, t.null]),
    reference: t.union([t.string, t.null]),
  }),
])

const balance = t.type({
  date: t.unknown,
  amount: euroValue,
})

const newBankStatement = t.type({
  id: t.string,
  accountIban: t.string,
  generatedAt: t.unknown,
  transactions: t.array(newBankTransaction),
  openingBalance: balance,
  closingBalance: balance,
})

export type BankStatement = t.TypeOf<typeof newBankStatement>

export type DbBankStatement = {
  id: string
  account: string
  generated_at: string
  opening_balance_date: Date
  opening_balance: number
  closing_balance_date: Date
  closing_balance: number
}

export type Email = FromDbType<DbEmail>

export type DbPaymentEventTransactionMapping = {
  bank_transaction_id: string
  payment_event_id: string
}
