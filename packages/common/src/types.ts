import * as t from 'io-ts';
import * as Either from 'fp-ts/Either';
import * as tt from 'io-ts-types';
import { flow, pipe } from 'fp-ts/function';
import { EuroValue, euro, euroValue } from './currency';
import { isMatch } from 'date-fns/isMatch';
import { split } from 'fp-ts/string';
import { reduce, reverse } from 'fp-ts/ReadonlyNonEmptyArray';
import { foldW } from 'fp-ts/Either';
import { format } from 'date-fns/fp/format';
export { type EuroValue, euro };

const date = new t.Type(
  'date',
  (u): u is Date | string => {
    if (u instanceof Date) {
      return true;
    }

    if (typeof u === 'string') {
      return true;
    }

    return false;
  },
  (u, _ctx) => {
    if (u instanceof Date) {
      return Either.right(u);
    }

    return tt.DateFromISOString.decode(u);
  },
  v => `${v}`,
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nullable = <T extends t.Type<any, any, any>>(type: T) =>
  t.union([t.null, type]);

type Join<Items> = Items extends [infer FirstItem, ...infer Rest]
  ? FirstItem extends string
    ? Rest extends string[]
      ? `${FirstItem}${Capitalize<Join<Rest>>}`
      : FirstItem
    : never
  : Items extends string
    ? Items
    : '';

type Split<
  Str,
  Delim extends string,
> = Str extends `${infer Head}${Delim}${infer Rest}`
  ? [Head, ...Split<Rest, Delim>]
  : Str extends string
    ? Str extends ''
      ? never
      : [Str]
    : never;

export type FromDbType<T extends object> = {
  [K in keyof T as Join<Split<K, '_'>>]: T[K];
};

export type TkoAlyUserId = {
  type: 'upstream';
  id: number;
};

export const tkoalyIdentity = (id: number): TkoalyIdentity => ({
  type: 'tkoaly',
  value: id,
});

export const emailIdentity = (id: string): EmailIdentity => ({
  type: 'email',
  value: id,
});

export const internalIdentity = (id: string): InternalIdentity => ({
  type: 'internal',
  value: id,
});

export const numberFromString = new t.Type<number, string, unknown>(
  'numberFromString',
  t.number.is,
  (input, context) =>
    pipe(
      t.string.validate(input, context),
      Either.chain(value =>
        value.length === 0 || value === null
          ? Either.left([])
          : t.number.decode(Number(value) || null),
      ),
    ),
  String,
);

const isNonEmpty = <T>(a: T[]): a is [T, ...T[]] => a.length > 0;

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
            : Either.right(value),
        ),
      ),
    arr => arr,
  );

export type ApiEvent = {
  id: 1078;
  name: string;
  starts: string;
  registration_starts: string;
  registration_ends: string;
  cancellation_starts: string;
  cancellation_ends: string;
  max_participants: number | null;
  registration_count: number;
  location: string;
  deleted: 0 | 1;
  price: string;
};

export const event = t.intersection([
  t.type({
    id: t.number,
    name: t.string,
    starts: tt.date,
    deleted: t.boolean,
  }),
  t.partial({
    registrationStarts: tt.date,
    registrationEnds: tt.date,
    cancellationStarts: tt.date,
    cancellationEnds: tt.date,
    registrationCount: t.number,
    maxParticipants: t.number,
    location: t.string,
    price: euroValue,
  }),
]);

export type Event = t.TypeOf<typeof event>;

export const tkoalyIdentityT = t.type({
  type: t.literal('tkoaly'),
  value: t.number,
});

export const emailIdentityT = t.type({
  type: t.literal('email'),
  value: t.string,
});

export const internalIdentityT = t.type({
  type: t.literal('internal'),
  value: t.string,
});

export const identityT = t.union([
  tkoalyIdentityT,
  emailIdentityT,
  internalIdentityT,
]);

export type TkoalyIdentity = t.TypeOf<typeof tkoalyIdentityT>;
export type EmailIdentity = t.TypeOf<typeof emailIdentityT>;
export type InternalIdentity = t.TypeOf<typeof internalIdentityT>;

export const TkoalyIdentityFromNumber = new t.Type(
  'TkoalyIdentityFromNumber',
  tkoalyIdentityT.is,
  flow(t.number.decode, Either.map(tkoalyIdentity)),
  (id: TkoalyIdentity) => id.value,
);

export const payerIdentity = t.union([
  emailIdentityT,
  tkoalyIdentityT,
  internalIdentityT,
]);

export type PayerIdentity = t.TypeOf<typeof payerIdentity>;

export function isTkoalyIdentity(id: PayerIdentity): id is TkoalyIdentity {
  return id.type === 'tkoaly';
}

export function isInternalIdentity(id: PayerIdentity): id is InternalIdentity {
  return id.type === 'internal';
}

export function isEmailIdentity(id: PayerIdentity): id is EmailIdentity {
  return id.type === 'email';
}

export type ExternalIdentity = TkoalyIdentity | EmailIdentity;

export const upstreamUserRole = t.union([
  t.literal('kayttaja'),
  t.literal('virkailija'),
  t.literal('tenttiarkistovirkailija'),
  t.literal('jasenvirkailija'),
  t.literal('yllapitaja'),
]);

export const upstreamUser = t.type({
  id: tkoalyIdentityT,
  screenName: t.string,
  email: t.string,
  username: t.string,
  role: upstreamUserRole,
});

export type UpstreamUserRole = t.TypeOf<typeof upstreamUserRole>;
export type UpstreamUser = t.TypeOf<typeof upstreamUser>;

export type DbPayerEmail = {
  payer_id: string;
  email: string;
  priority: PayerEmailPriority;
  source: 'tkoaly' | 'other' | 'user';
  created_at: Date;
  updated_at: Date;
};

export const payerEmailPriority = t.union([
  t.literal('primary'),
  t.literal('disabled'),
  t.literal('default'),
]);

export type PayerEmailPriority = t.TypeOf<typeof payerEmailPriority>;

export const payerEmailSource = t.union([
  t.literal('tkoaly'),
  t.literal('other'),
  t.literal('user'),
]);

export type PayerEmailSource = t.TypeOf<typeof payerEmailSource>;

export const payerEmail = t.type({
  payerId: internalIdentityT,
  email: t.string,
  priority: payerEmailPriority,
  source: payerEmailSource,
  createdAt: date,
  updatedAt: date,
});

export type PayerEmail = t.TypeOf<typeof payerEmail>;

export type DbPayerProfile = {
  id: string;
  tkoaly_user_id?: number;
  stripe_customer_id: string;
  primary_email?: string;
  created_at: Date;
  updated_at: Date;
  name: string;
  disabled: boolean;
  merged_to: string;
  paid_count?: number;
  unpaid_count?: number;
  debt_count?: number;
  total?: number;
  total_paid?: number;
  paid_ratio?: number;
  unpaid_value?: number;
};

export const payerProfile = t.type({
  id: internalIdentityT,
  tkoalyUserId: nullable(tkoalyIdentityT),
  createdAt: date,
  updatedAt: date,
  name: t.string,
  disabled: t.boolean,
  mergedTo: nullable(internalIdentityT),
  paidCount: nullable(t.number),
  unpaidCount: nullable(t.number),
  debtCount: nullable(t.number),
  total: nullable(euroValue),
  totalPaid: nullable(euroValue),
  emails: t.array(payerEmail),
  primaryEmail: nullable(t.string),
  paidRatio: t.number,
  unpaidValue: nullable(euroValue),
});

export type PayerProfile = t.TypeOf<typeof payerProfile>;

const payerPreferenceFields = {
  uiLanguage: t.union([t.literal('fi'), t.literal('en')]),
  emailLanguage: t.union([t.literal('fi'), t.literal('en')]),
  hasConfirmedMembership: t.boolean,
};

export const payerPreferences = t.type(payerPreferenceFields);
export const payerPreferencePatch = t.partial(payerPreferenceFields);

export type PayerPreferences = t.TypeOf<typeof payerPreferences>;

export type DbPaymentMethod = {
  id: string;
  payer_id: string;
  stripe_pm_id: string;
  brand: string;
  last4: string;
  exp_month: number;
  exp_year: number;
  created_at: Date;
  updated_at: Date;
};
export type PaymentMethod = Omit<
  FromDbType<DbPaymentMethod>,
  'payerId' | 'stripePmId'
> & {
  payerId: InternalIdentity;
  stripePaymentMethodId: string;
};

export type DbPaymentEvent = {
  id: string;
  payment_id: string;
  type: string;
  amount: number;
  time: Date | string;
  data: unknown;
};

export const paymentEvent = t.type({
  id: t.string,
  paymentId: t.string,
  type: t.string,
  amount: euroValue,
  time: tt.date,
  data: nullable(t.UnknownRecord),
});

export type PaymentEvent = t.TypeOf<typeof paymentEvent>;

export const TokenPayload = t.type({
  id: t.string,
  upstreamId: t.number,
  email: t.string,
  screenName: t.string,
});

export type TokenPayload = t.TypeOf<typeof TokenPayload>;

export type Session = {
  payerId: null | string;
  paymentMethod: Pick<PaymentMethod, 'id' | 'brand' | 'last4'>;
  user: TokenPayload;
  preferences: PayerPreferences;
};

/*export type DbPayment = {
  id: string;
  human_id: string;
  human_id_nonce?: number;
  accounting_period: number;
  payer_id: string;
  payment_status: PaymentStatus;
  stripe_payment_intent_id: string;
  created_at: Date;
  updated_at: Date;
  payment_number: number;
  data: unknown;
  credited: boolean;
};*/

export type DbPayment = {
  id: string;
  human_id: string;
  human_id_nonce?: number;
  accounting_period: number;
  type: 'invoice';
  initial_amount: number;
  payers: Array<{ id: string; name: string }>;
  debts: Array<{ id: string; name: string }>;
  title: string;
  payer_id: string;
  paid_at: Date | null;
  data: Record<string, unknown>;
  message: string;
  balance: number;
  status: 'canceled' | 'paid' | 'unpaid' | 'mispaid';
  updated_at: Date;
  created_at: Date;
  payment_number: string;
  credited: boolean;
  events: Array<DbPaymentEvent>;
};

export type DbLineItem = {
  id: string;
  payment_id: string;
  event_id: number;
  event_item_id: number;
  amount: number;
  currency: string;
  item_name: string;
  created_at: Date;
  updated_at: Date;
};

export type LineItem = Omit<FromDbType<DbLineItem>, 'amount'> & {
  amount: EuroValue;
};

export type DbDebtCenter = {
  paid_count?: number;
  human_id: string;
  accounting_period: number;
  unpaid_count?: number;
  debt_count?: number;
  id: string;
  name: string;
  description: string;
  url: string;
  created_at: Date;
  updated_at: Date;
  total?: number;
};

export const debtCenter = t.type({
  paidCount: nullable(t.number),
  humanId: t.string,
  accountingPeriod: t.number,
  unpaidCount: nullable(t.number),
  debtCount: nullable(t.number),
  id: t.string,
  name: t.string,
  description: t.string,
  url: t.string,
  createdAt: tt.date,
  updatedAt: tt.date,
  total: nullable(euroValue),
});

export const debtCenterPatch = t.intersection([
  t.type({
    id: t.string,
  }),
  t.partial({
    name: t.string,
    description: t.string,
    url: t.string,
  }),
]);

export type DebtCenter = t.TypeOf<typeof debtCenter>;
export type DebtCenterPatch = t.TypeOf<typeof debtCenterPatch>;

export type NewDebtCenter = Omit<
  DebtCenter,
  | 'id'
  | 'createdAt'
  | 'updatedAt'
  | 'humanId'
  | 'paidCount'
  | 'unpaidCount'
  | 'debtCount'
  | 'total'
>;

export type DbDebtComponent = {
  id: string;
  name: string;
  value?: string;
  amount: number;
  description: string;
  debt_center_id: string;
};

export type DebtComponentPatch = Partial<{
  name: string;
  amount: EuroValue;
}>;

export const debtComponent = t.type({
  id: t.string,
  name: t.string,
  amount: euroValue,
  description: t.string,
  debtCenterId: t.string,
  createdAt: nullable(tt.date),
  updatedAt: nullable(tt.date),
});

export const debtComponentPatch = t.partial({
  name: t.string,
  amount: euroValue,
  description: t.string,
  debtCenterId: t.string,
});

export type DebtComponent = t.TypeOf<typeof debtComponent>;

export type NewDebtComponent = Omit<
  DebtComponent,
  'id' | 'createdAt' | 'updatedAt' | 'amount'
> & { amount: EuroValue };

export type DbDebtComponentMapping = {
  component_id: string;
  debt_id: string;
};

export type DbDebtTag = {
  name: string;
  hidden: boolean;
  debt_id: string;
};

export const debtTag = t.type({
  name: t.string,
  hidden: t.boolean,
});

export type DebtTag = t.TypeOf<typeof debtTag>;

export type DbDebt = {
  id: string;
  human_id: string;
  accounting_period: number;
  name: string;
  tags: DbDebtTag[];
  date: Date | null;
  last_reminded: Date | null;
  due_date: Date | null;
  marked_as_paid: Date | null;
  draft: boolean;
  published_at: Date | null;
  published_by: string | null;
  credited_at: Date | null;
  credited_by: string | null;
  payer_id: string;
  debt_center_id: string;
  description: string;
  created_at: Date;
  updated_at: Date;
  status: DebtStatus;
  payment_condition: number | null;
  default_payment: string | null;
  credited: boolean;
  payment_options: Record<string, unknown> | null;
};

export const debtStatus = t.union([
  t.literal('paid'),
  t.literal('unpaid'),
  t.literal('mispaid'),
]);

export type DebtStatus = t.TypeOf<typeof debtStatus>;

export const debt = t.type({
  id: t.string,
  humanId: t.string,
  accountingPeriod: t.number,
  name: t.string,
  tags: t.array(debtTag),
  date: nullable(tt.date),
  lastReminded: nullable(tt.date),
  markedAsPaid: nullable(tt.date),
  dueDate: nullable(tt.date),
  draft: t.boolean,
  publishedAt: nullable(tt.date),
  publishedBy: nullable(internalIdentityT),
  creditedAt: nullable(tt.date),
  creditedBy: nullable(internalIdentityT),
  payerId: internalIdentityT,
  debtCenterId: t.string,
  description: t.string,
  createdAt: tt.date,
  updatedAt: tt.date,
  status: debtStatus,
  paymentCondition: nullable(t.number),
  defaultPayment: nullable(t.string),
  credited: t.boolean,
  total: euroValue,
  debtComponents: t.array(debtComponent),
  paymentOptions: nullable(t.UnknownRecord),
});

export type Debt = t.TypeOf<typeof debt>;

export type DebtWithPayer = Debt & { payer: PayerProfile };

export type DebtComponentDetails = { debtComponents: DebtComponent[] };

export interface DateBrand {
  readonly Date: unique symbol;
}

export const dateString = t.brand(
  t.string,
  (n): n is t.Branded<string, DateBrand> => isMatch(n, 'd.M.yyyy'),
  'Date',
);

export type DateString = t.TypeOf<typeof dateString>;

interface DbDateBrand {
  readonly DbDate: unique symbol;
}

export const dbDateString = t.brand(
  t.string,
  (n): n is t.Branded<string, DbDateBrand> => isMatch(n, 'yyyy-MM-dd'),
  'DbDate',
);

export type DbDateString = t.TypeOf<typeof dbDateString>;

export type NewDebtTag = { name: string; hidden: boolean };

export type NewDebt = {
  centerId: string;
  description: string;
  accountingPeriod: number;
  components: string[];
  publishedAt?: DbDateString | null;
  name: string;
  payer: PayerIdentity;
  date?: DbDateString | null;
  dueDate: DbDateString | null;
  createdAt?: Date;
  paymentCondition: null | number;
  tags: Array<NewDebtTag>;
  defaultPayment?: { type: 'invoice'; options: Partial<NewInvoice> };
};

export const debtPatch = t.intersection([
  t.type({
    id: t.string,
  }),
  t.partial({
    name: t.string,
    description: t.string,
    payerId: identityT,
    dueDate: nullable(tt.date),
    date: nullable(dbDateString),
    paymentCondition: nullable(t.number),
    centerId: t.string,
    components: t.array(t.string),
    tags: t.array(t.string),
  }),
]);

export type DebtPatch = t.TypeOf<typeof debtPatch>;

export type MultipleDebtPatchValues = {
  name?: string;
  description?: string;
  payerId?: PayerIdentity;
  dueDate?: Date | null;
  date?: DbDateString | null;
  paymentCondition?: number | null;
  centerId?: string;
  components?: {
    id: string;
    operation: 'include' | 'exclude';
  }[];
  tags?: {
    name: string;
    operation: 'include' | 'exclude';
  }[];
};

export const dateToDbDateString = flow(
  format('yyyy-MM-dd'),
  value => value as t.Branded<string, DbDateBrand>,
);

export const convertToDbDate: (date: DateString) => DbDateString | null = flow(
  split('.'),
  reverse,
  reduce(null as string | null, (a, p) => (a === null ? p : a + '-' + p)),
  dbDateString.decode,
  foldW(
    () => null,
    a => a,
  ),
);

export type ApiRegistration = {
  id: number;
  user_id: number | null;
  name: string;
  email: string;
  phone: string;
  answers: { question_id: number; question: string; answer: string }[];
};

export const registration = t.type({
  id: t.number,
  userId: t.union([t.null, tkoalyIdentityT]),
  name: t.string,
  email: t.string,
  phone: t.string,
  answers: t.array(
    t.type({
      questionId: t.number,
      question: t.string,
      answer: t.string,
    }),
  ),
});

export type Registration = t.TypeOf<typeof registration>;

export type ApiCustomField = {
  id: number;
  name: string;
  type: 'text' | 'textarea' | 'radio' | 'checkbox';
  options: string[];
};

export const customField = t.type({
  id: t.number,
  name: t.string,
  type: t.union([
    t.literal('text'),
    t.literal('textarea'),
    t.literal('radio'),
    t.literal('checkbox'),
  ]),
  options: t.array(t.string),
});

export type CustomField = t.TypeOf<typeof customField>;

const paymentStatus = t.union([
  t.literal('paid'),
  t.literal('canceled'),
  t.literal('mispaid'),
  t.literal('unpaid'),
]);

export type PaymentStatus = t.TypeOf<typeof paymentStatus>;

export const payment = t.type({
  id: t.string,
  humanId: t.string,
  humanIdNonce: nullable(t.number),
  accountingPeriod: t.number,
  paymentNumber: t.string,
  type: t.union([t.literal('invoice'), t.literal('cash'), t.literal('stripe')]),
  data: nullable(t.UnknownRecord),
  message: t.string,
  // payerId: internalIdentityT,
  title: t.string,
  createdAt: tt.date,
  balance: euroValue,
  credited: t.boolean,
  status: paymentStatus,
  updatedAt: tt.date,
  events: t.array(paymentEvent),
  paidAt: nullable(tt.date),
  initialAmount: euroValue,
  payers: t.array(
    t.type({
      id: t.string,
      name: t.string,
    }),
  ),
  debts: t.array(
    t.type({
      id: t.string,
      name: t.string,
    }),
  ),
});

export type Payment = {
  id: string;
  humanId: string;
  humanIdNonce: number | null;
  accountingPeriod: number;
  paidAt: Date | null;
  initialAmount: EuroValue;
  paymentNumber: string;
  type: 'invoice' | 'cash' | 'stripe';
  data: Record<string, unknown> | null;
  message: string;
  title: string;
  createdAt: Date;
  balance: EuroValue;
  credited: boolean;
  status: PaymentStatus;
  updatedAt: Date;
  events: Array<PaymentEvent>;
  debts: Array<{ id: string; name: string }>;
  payers: Array<{ id: string; name: string }>;
};

export const newInvoice = t.type({
  title: t.string,
  series: t.number,
  message: t.string,
  date: nullable(tt.date),
  debts: t.array(t.string),
  referenceNumber: nullable(t.string),
  paymentNumber: nullable(t.string),
});

export const newInvoicePartial = t.partial({
  title: t.string,
  series: t.number,
  message: t.string,
  date: nullable(tt.date),
  debts: t.array(t.string),
  referenceNumber: nullable(t.string),
  paymentNumber: nullable(t.string),
});

export type NewInvoice = t.TypeOf<typeof newInvoice>;

export const isPaymentInvoice = (
  p: Payment,
): p is Payment & {
  type: 'invoice';
  data: { reference_number: string; due_date: string; date: string };
} => {
  return (
    p.type === 'invoice' &&
    p.data !== null &&
    'reference_number' in p.data &&
    'due_date' in p.data &&
    (!('date' in p.data) ||
      ('date' in p.data && typeof p.data.date === 'string'))
  );
};

export type DbEmail = {
  id: string;
  recipient: string;
  subject: string;
  template: string;
  html: string | null;
  text: string;
  draft: boolean;
  created_at: Date;
  sent_at: Date | null;
};

export const email = t.type({
  id: t.string,
  recipient: t.string,
  subject: t.string,
  template: t.string,
  html: nullable(t.string),
  text: t.string,
  draft: t.boolean,
  createdAt: tt.date,
  sentAt: nullable(tt.date),
});

export type Email = t.TypeOf<typeof email>;

export const bankAccount = t.type({
  iban: t.string,
  name: t.string,
});

export type BankAccount = t.TypeOf<typeof bankAccount>;

export type DbBankTransaction = {
  id: string;
  account: string;
  amount: number;
  value_time: Date | string;
  type: 'credit' | 'debit';
  other_party_account: string | null;
  other_party_name: string;
  reference: string | null;
  message: string | null;
  payments: DbPayment[] | null;
};

export const bankTransaction = t.type({
  id: t.string,
  account: t.string,
  amount: euroValue,
  date: tt.date,
  type: t.union([t.literal('credit'), t.literal('debit')]),
  otherParty: nullable(
    t.type({
      name: t.string,
      account: nullable(t.string),
    }),
  ),
  reference: nullable(t.string),
  message: nullable(t.string),
  payments: t.array(payment),
});

export type BankTransaction = t.TypeOf<typeof bankTransaction>;

const newBankTransactionBase = t.intersection([
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
]);

export const newBankTransaction = t.intersection([
  newBankTransactionBase,
  t.type({
    bankStatementId: t.string,
  }),
]);

const balance = t.type({
  date: tt.date,
  amount: euroValue,
});

export const newBankStatement = t.intersection([
  t.type({
    id: t.string,
    accountIban: t.string,
    generatedAt: tt.date,
    openingBalance: balance,
    closingBalance: balance,
  }),
  t.partial({
    transactions: t.array(newBankTransactionBase),
  }),
]);

export const bankStatement = t.type({
  id: t.string,
  accountIban: t.string,
  generatedAt: tt.date,
  openingBalance: balance,
  closingBalance: balance,
});

export type BankStatement = t.TypeOf<typeof newBankStatement>;

export type DbBankStatement = {
  id: string;
  account: string;
  generated_at: Date;
  opening_balance_date: Date;
  opening_balance: number;
  closing_balance_date: Date;
  closing_balance: number;
};

export type DbPaymentEventTransactionMapping = {
  bank_transaction_id: string;
  payment_event_id: string;
};

export type DbReport = {
  id: string;
  status: 'generating' | 'failed' | 'finished';
  name: string;
  generated_at: Date | string;
  human_id: string;
  options: unknown;
  revision: number;
  type: string;
  history: Array<Omit<DbReport, 'history'>>;
  generated_by: string;
};

export const reportStatus = t.union([
  t.literal('generating'),
  t.literal('failed'),
  t.literal('finished'),
]);

export const reportWithoutHistory = t.type({
  id: t.string,
  status: reportStatus,
  name: t.string,
  generatedAt: tt.date,
  humanId: t.string,
  options: t.unknown,
  revision: t.number,
  type: t.union([t.null, t.string]),
  generatedBy: t.union([t.null, internalIdentityT]),
});

export const report = t.intersection([
  reportWithoutHistory,
  t.type({
    history: t.array(reportWithoutHistory),
  }),
]);

export type Report = t.TypeOf<typeof report>;

export type DebtLedgerOptions = {
  startDate: DbDateString;
  endDate: DbDateString;
  includeDrafts: 'include' | 'exclude' | 'only-drafts';
  groupBy: null | 'center' | 'payer';
  centers: null | Array<string>;
};

export type DbAccountingPeriod = {
  year: number;
  closed: boolean;
};

export type AccountingPeriod = FromDbType<DbAccountingPeriod>;

export type PaymentLedgerOptions = {
  startDate: DbDateString;
  endDate: DbDateString;
  paymentType: null | 'invoice' | 'cash' | 'stripe';
  centers: null | Array<string>;
  eventTypes: null | Array<'created' | 'payment' | 'credited'>;
  groupBy: null | 'center' | 'payer';
};

export type DebtStatusReportOptions = {
  date: DbDateString;
  groupBy: null | 'center' | 'payer';
  centers: null | Array<string>;
  includeOnly: null | 'paid' | 'credited' | 'open';
};

export const massCreateDebtsPayload = t.type({
  defaults: t.partial({
    tkoalyUserId: t.number,
    debtCenter: t.string,
    title: t.string,
    description: t.string,
    email: t.string,
    amount: euroValue,
    dueDate: dateString,
    components: t.array(t.string),
    tags: t.array(t.string),
    accountingPeriod: t.Int,
    //paymentNumber: t.string,
    //referenceNumber: t.string,
  }),
  debts: t.array(
    t.partial({
      tkoalyUserId: t.number,
      debtCenter: t.string,
      title: t.string,
      description: t.string,
      email: t.string,
      date: dateString,
      amount: euroValue,
      dueDate: dateString,
      publishedAt: dateString,
      paymentCondition: t.Int,
      components: t.array(t.string),
      paymentNumber: t.string,
      referenceNumber: t.string,
      tags: t.array(t.string),
      accountingPeriod: t.Int,
    }),
  ),
  components: t.array(
    t.type({
      name: t.string,
      amount: euroValue,
    }),
  ),
  dryRun: t.boolean,
});

const componentRule = t.type({
  type: t.literal('CUSTOM_FIELD'),
  eventId: t.number,
  customFieldId: t.number,
  value: t.string,
});

export type MassCreateDebtsPayload = t.TypeOf<typeof massCreateDebtsPayload>;

export const createDebtCenterFromEventBody = t.type({
  events: t.array(t.number),
  registrations: t.array(t.number),
  settings: t.type({
    name: t.string,
    description: t.string,
    basePrice: euroValue,
    accountingPeriod: t.Int,
    dueDate: dateString,
    components: t.array(
      t.type({
        name: t.string,
        amount: euroValue,
        rules: t.array(componentRule),
      }),
    ),
  }),
});

export const paginationQuery = t.partial({
  cursor: t.string,
  limit: tt.NumberFromString,
  sort: t.type({
    column: t.string,
    dir: t.union([t.literal('asc'), t.literal('desc')]),
  }),
});

export type PaginationQuery = t.TypeOf<typeof paginationQuery>;

export const paginationQueryPayload = t.partial({
  cursor: t.string,
  limit: t.number,
  sort: t.type({
    column: t.string,
    dir: t.union([t.literal('asc'), t.literal('desc')]),
  }),
});

export const paginationQueryResponse = <T extends t.Any>(type: T) =>
  t.type({
    result: t.array(type),
    nextCursor: t.union([t.string, t.null]),
  });

export type PaginationQueryArgs = t.TypeOf<typeof paginationQueryPayload>;
export type PaginationQueryResponse<T> = t.TypeOf<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ReturnType<typeof paginationQueryResponse<t.Type<T, any, any>>>
>;

export type CreateDebtCenterFromEventBody = t.TypeOf<
  typeof createDebtCenterFromEventBody
>;

export const auditEventAction = t.union([
  t.literal('bank-statement.create'),
  t.literal('debt-center.create'),
  t.literal('debt-center.delete'),
  t.literal('debt.create'),
  t.literal('debt.delete'),
  t.literal('debt.publish'),
  t.literal('debt.credit'),
  t.literal('debt.update'),
  t.literal('debt.update.add-component'),
  t.literal('debt.update.remove-component'),
  t.literal('payer.create'),
  t.literal('payer.merge'),
  t.literal('payer.update'),
]);

export const resourceType = t.union([
  t.literal('payer'),
  t.literal('debt'),
  t.literal('debt-center'),
  t.literal('bank-statement'),
]);

export type ResourceType = t.TypeOf<typeof resourceType>;

export type AuditEventAction = t.TypeOf<typeof auditEventAction>;

export const auditEvent = t.type({
  entryId: t.string,
  time: tt.date,
  action: auditEventAction,
  subject: nullable(internalIdentityT),
  details: t.unknown,
  links: t.array(
    t.type({
      type: t.string,
      target: t.type({
        type: resourceType,
        id: t.string,
      }),
      label: t.string,
    }),
  ),
});

export type AuditEvent = t.TypeOf<typeof auditEvent>;

export const jobState = t.union([
  t.literal('pending'),
  t.literal('scheduled'),
  t.literal('processing'),
  t.literal('succeeded'),
  t.literal('failed'),
]);

export type JobState = t.TypeOf<typeof jobState>;

export const Percentage = t.refinement(
  t.number,
  value => value >= 0 && value <= 1,
  'Percentage',
);

export const dbJob = t.type({
  id: t.string,
  type: t.string,
  title: nullable(t.string),
  state: jobState,
  created_at: tt.date,
  started_at: nullable(tt.date),
  finished_at: nullable(tt.date),
  data: t.unknown,
  result: t.unknown,
  delayed_until: nullable(tt.date),
  retries: t.number,
  max_retries: t.number,
  retry_delay: t.number,
  limit_class: t.string,
  concurrency_limit: nullable(t.Integer),
  ratelimit: nullable(t.Integer),
  ratelimit_period: nullable(t.Integer),
  triggered_by: nullable(t.string),
  concurrency: t.Integer,
  rate: t.Integer,
  next_poll: nullable(tt.date),
  progress: Percentage,
  lock_id: t.Integer,
});

export const job = t.type({
  id: t.string,
  type: t.string,
  title: nullable(t.string),
  state: jobState,
  createdAt: tt.date,
  startedAt: nullable(tt.date),
  finishedAt: nullable(tt.date),
  data: t.unknown,
  result: t.unknown,
  delayedUntil: nullable(tt.date),
  retries: t.number,
  maxRetries: t.number,
  retryDelay: t.number,
  limitClass: t.string,
  concurrencyLimit: nullable(t.Integer),
  ratelimit: nullable(t.Integer),
  ratelimitPeriod: nullable(t.Integer),
  triggeredBy: nullable(internalIdentityT),
  concurrency: t.Integer,
  rate: t.Integer,
  nextPoll: nullable(tt.date),
  progress: Percentage,
  lockId: t.Integer,
});

export type DbJob = t.TypeOf<typeof dbJob>;

export type Job<D = unknown, R = unknown> = {
  id: string;
  state: JobState;
  type: string;
  title: string | null;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  data: D;
  result: R | null;
  delayedUntil: Date | null;
  retries: number;
  maxRetries: number;
  retryDelay: number;
  limitClass: string;
  concurrencyLimit: number | null;
  ratelimit: number | null;
  ratelimitPeriod: number | null;
  triggeredBy: InternalIdentity | null;
  rate: number;
  concurrency: number;
  nextPoll: Date | null;
  progress: number;
  lockId: number;
};
