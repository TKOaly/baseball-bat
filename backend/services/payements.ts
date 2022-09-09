import { Service, Inject } from 'typedi'
import sql from 'sql-template-strings'
import { EuroValue, InternalIdentity } from '../../common/types'
import { PgClient } from '../db'
import { omit } from 'remeda'

function finnishReferenceChecksum(num: bigint): bigint {
  const factors = [7n, 3n, 1n]
  let acc = 0n

  for (let i = 0; num > (10n ** BigInt(i)); i++) {
    const digit = num / (10n ** BigInt(i)) % 10n
    acc += digit * factors[i % 3]
  }

  return (10n - acc % 10n) % 10n
}

function createReferenceNumber(series: number, year: number, number: number) {
  const finRef = 1337n * (10n ** 11n) + BigInt(year) * (10n ** 7n) + BigInt(number) * (10n ** 3n) + BigInt(series)
  const finCheck = finnishReferenceChecksum(finRef)
  const content = finRef * 10n + finCheck
  const tmp = content * (10n ** 6n) + 271500n
  const checksum = 98n - (tmp % 97n)
  const numbers: Record<string, string> = { Y: `${checksum}`, X: `${content}` }
  const template = 'RFYY XXXX XXXX XXXX XXXX'
  const acc = new Array(template.length)

  for (let i = template.length - 1; i >= 0; i--) {
    const letter = template[i]

    if (letter in numbers) {
      const number = numbers[letter]
      const digit = number[number.length - 1]
      acc[i] = digit ?? '0'
      numbers[letter] = number.substring(0, number.length - 1)
    } else {
      acc[i] = letter
    }
  }

  return acc.map(i => `${i}`).join('')
}

function formatPaymentNumber(parts: [number, number]): string {
  return parts.map(n => n.toString().padStart(4, '0')).join('-')
}

export type NewInvoice = {
  title: string
  series: number
  message: string
  debts: string[]
  referenceNumber?: string
  paymentNumber?: string
}

type NewPaymentEvent = {
  amount: EuroValue,
}

type IPaymentType<K extends string, D extends object> = {
  type: K
  data: D
}

type PaymentType = Invoice

type Invoice = {
  type: 'invoice'
  data: {}
}

type DbPayment = {
  id: string
  type: 'invoice'
  title: string
  data: Record<string, unknown>,
  message: string
  created_at: Date
  payment_number: number
}

type NewPayment<T extends PaymentType> = {
  type: T['type'],
  title: string,
  message: string,
  data: {},
  debts: Array<string>,
  paymentNumber?: string,
}

@Service()
export class PaymentService {
  @Inject(() => PgClient)
  pg: PgClient

  async getPayments() {
    return this.pg
      .any<DbPayment>(sql`
        SELECT
          p.*,
          s.balance,
          s.status,
          s.payer,
          COALESCE(s.updated_at, p.created_at) AS updated_at
        FROM payments p
        JOIN payment_statuses s ON s.id = p.id
      `)
  }

  async getPayment(id: string) {
    return await this.pg
      .one<DbPayment>(sql`
        SELECT
          p.*,
          s.balance,
          s.status,
          s.payer,
          COALESCE(s.updated_at, p.created_at) AS updated_at
        FROM payments p
        JOIN payment_statuses s ON s.id = p.id
        WHERE p.id = ${id}
      `)
  }

  async getPayerPayments(id: InternalIdentity) {
    return this.pg
      .any<DbPayment>(sql`
        SELECT
          p.*,
          s.balance,
          s.status,
          s.payer,
          COALESCE(s.updated_at, p.created_at) AS updated_at
        FROM payments p
        JOIN payment_statuses s ON s.id = p.id
        WHERE s.payer->>'id' = ${id.value}
      `)
  }

  async getPaymentsContainingDebt(debtId: string) {
    return this.pg
      .any<DbPayment>(sql`
        SELECT
          p.*,
          s.balance,
          s.status,
          s.payer,
          COALESCE(s.updated_at, p.created_at) AS updated_at
        FROM payments p
        JOIN payment_statuses s ON s.id = p.id
        JOIN payment_debt_mappings pdm ON pdm.payment_id = p.id
        WHERE pdm.debt_id = ${debtId}
      `);
  }

  async getDefaultInvoicePaymentForDebt(debtId: string) {
    const payment = await this.pg
      .any<DbPayment>(sql`
        SELECT * FROM (
          SELECT
            p.*,
            s.balance,
            s.status,
            s.payer,
            COALESCE(s.updated_at, p.created_at) AS updated_at,
            (SELECT ARRAY_AGG(debt_id) FROM payment_debt_mappings WHERE payment_id = p.id) AS debt_ids
          FROM payments p
          JOIN payment_statuses s ON s.id = p.id
        ) s
        WHERE ${debtId} = ANY (debt_ids) AND ARRAY_LENGTH(debt_ids, 1) = 1 AND type = 'invoice'
        ORDER BY created_at
        LIMIT 1
      `)

    if (payment.length === 0) {
      return null;
    }

    return payment[0]
  }

  async logPaymentEvent(
    paymentId: string,
    amount: EuroValue,
    data: object,
  ) {
    const result = await this.pg
      .one<DbPayment>(sql`
        INSERT INTO payment_events (payment_id, type, amount, data)
        VALUES (${paymentId}, 'payment', ${amount}, ${data})
        RETURNING *
     `)

    return result
  }

  async createPaymentNumber(): Promise<[number, number]> {
    return await this.pg.tx(async (tx) => {
      const [result] = await tx.do<{ year: number, number: number }>(sql`
        UPDATE payment_numbers
        SET number = number + 1
        WHERE year = DATE_PART('year', NOW())
        RETURNING year, number
      `)

      if (result) {
        const { year, number } = result
        return [year, number]
      }

      const [{ year, number }] = await tx.do<{ year: number, number: number }>(sql`INSERT INTO payment_numbers (year, number) VALUES (DATE_PART('year', NOW()), 0) RETURNING *`)

      return [year, number]
    })
  }

  async createInvoice(invoice: NewInvoice) {
    const [year, number] = await this.createPaymentNumber();

    const reference_number = invoice.referenceNumber ?? createReferenceNumber(invoice.series ?? 0, year, number)

    const paymentNumber = invoice.paymentNumber ?? formatPaymentNumber([year, number])

    return this.createPayment({
      type: 'invoice',
      data: { reference_number },
      message: invoice.message,
      debts: invoice.debts,
      paymentNumber,
      title: invoice.title,
    })
  }

  async createPayment<T extends PaymentType>(payment: NewPayment<T>) {
    const paymentNumber = payment.paymentNumber ?? formatPaymentNumber(await this.createPaymentNumber())

    return this.pg.tx(async (tx) => {
      const [createdPayment] = await tx.do<DbPayment>(sql`
        INSERT INTO payments (type, data, message, title, payment_number)
        VALUES ('invoice', ${payment.data}, ${payment.message}, ${payment.title}, ${paymentNumber})
        RETURNING *
      `)

      if (!createdPayment) {
        throw new Error(`Could not create payment`)
      }

      await Promise.all(
        payment.debts.map((debt) => tx.do(sql`
          INSERT INTO payment_debt_mappings (payment_id, debt_id)
          VALUES (${createdPayment.id}, ${debt})
        `))
      )

      const [{ total }] = (await tx.do<{ total: number }>(sql`
        SELECT SUM(c.amount) AS total
        FROM debt_component_mapping m
        JOIN debt_component c ON c.id = m.debt_component_id
        WHERE m.debt_id = ANY (${payment.debts})
      `))!

      await tx.do(sql`
        INSERT INTO payment_events (payment_id, type, amount)
        VALUES (${createdPayment.id}, 'created', ${-total})
      `)

      return createdPayment
    })
  }
}
