import { Service, Inject } from 'typedi'
import sql from 'sql-template-strings'
import { BankTransaction, DbPaymentEventTransactionMapping, Debt, EuroValue, InternalIdentity, Payment } from '../../common/types'
import { PgClient } from '../db'
import { omit } from 'remeda'
import { DebtService } from './debt'

type PaymentWithEvents = Payment & {
  events: Array<{
    time: Date
    data: Record<string, unknown>
    type: 'created' | 'payment'
    amount: EuroValue
  }>,
}

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

type BankTransactionDetails = {
  accountingId: string
  referenceNumber: string
  amount: EuroValue
  time: Date
}

type NewPaymentEvent = {
  amount: EuroValue,
  type: 'created' | 'payment'
  data?: Record<string, any>
  time?: Date
  transaction?: string
}

type IPaymentType<K extends string, D extends object> = {
  type: K
  data: D
}

type PaymentType = Invoice | CashPayment

type Invoice = {
  type: 'invoice'
  data: {}
}

type CashPayment = {
  type: 'cash'
  data: {}
}

type DbPayment = {
  id: string
  type: 'invoice'
  title: string
  payer_id: string
  data: Record<string, unknown>,
  message: string
  created_at: Date
  payment_number: number
  credited: boolean
  events: Array<{ id: string, time: string, type: string, data: any, amount: number }>
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

  @Inject(() => DebtService)
  debtService: DebtService

  async getPayments() {
    return this.pg
      .any<DbPayment>(sql`
        SELECT
          p.*,
          s.balance,
          s.status,
          s.payer,
          (SELECT payer_id FROM payment_debt_mappings pdm JOIN debt d ON pdm.debt_id = d.id WHERE pdm.payment_id = p.id LIMIT 1) AS payer_id,
          (SELECT ARRAY_AGG(TO_JSON(payment_events.*)) FROM payment_events WHERE payment_id = p.id) AS events,
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
          (SELECT ARRAY_AGG(TO_JSON(payment_events.*)) FROM payment_events WHERE payment_id = p.id) AS events,
          (SELECT payer_id FROM payment_debt_mappings pdm JOIN debt d ON pdm.debt_id = d.id WHERE pdm.payment_id = p.id LIMIT 1) AS payer_id,
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
          (SELECT ARRAY_AGG(TO_JSON(payment_events.*)) FROM payment_events WHERE payment_id = p.id) AS events,
          COALESCE(s.updated_at, p.created_at) AS updated_at
        FROM payments p
        JOIN payment_statuses s ON s.id = p.id
        WHERE s.payer->>'id' = ${id.value} AND (
          SELECT every(NOT d.draft)
          FROM payment_debt_mappings pdm
          JOIN debt d ON d.id = pdm.debt_id
          WHERE pdm.payment_id = p.id
        )
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
          (SELECT ARRAY_AGG(TO_JSON(payment_events.*)) FROM payment_events WHERE payment_id = p.id) AS events,
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
            (SELECT ARRAY_AGG(TO_JSON(payment_events.*)) FROM payment_events WHERE payment_id = p.id) AS events,
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

  async createInvoice(invoice: NewInvoice): Promise<Payment & { data: { due_date: string, reference_number: string } }> {
    const [year, number] = await this.createPaymentNumber();

    const reference_number = invoice.referenceNumber ?? createReferenceNumber(invoice.series ?? 0, year, number)

    const paymentNumber = invoice.paymentNumber ?? formatPaymentNumber([year, number])

    const results = await Promise.all(invoice.debts.map(id => this.debtService.getDebt(id)))

    if (results.some(d => d === null)) {
      throw new Error('Debt does not exist')
    }

    const debts = results as Array<Debt>

    const due_dates = debts.map(debt => new Date(debt.dueDate)).sort()
    const due_date = due_dates[0]

    return this.createPayment({
      type: 'invoice',
      data: { reference_number, due_date },
      message: invoice.message,
      debts: invoice.debts,
      paymentNumber,
      title: invoice.title,
    }) as any
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

  async createPaymentEvent(id: string, event: NewPaymentEvent) {
    const created = await this.pg.one<{ id: string }>(sql`
      INSERT INTO payment_events (payment_id, type, amount, data, time)
      VALUES (${id}, ${event.type}, ${event.amount.value}, ${event.data}, ${event.time})
      RETURNING *
    `)

    if (!created) {
      throw new Error('Could not create payment event')
    }

    if (event.transaction) {
      await this.pg.one(sql`
        INSERT INTO payment_event_transaction_mapping (payment_event_id, bank_transaction_id)
        VALUES (${created.id}, ${event.transaction})
      `)
    }

    return created
  }

  async creditPayment(id: string) {
    const payment = await this.getPayment(id)

    if (!payment) {
      throw new Error('Payment not found')
    }

    await this.pg.any(sql`
      UPDATE payments
      SET credited = true
      WHERE id = ${id}
    `)
  }

  async getPaymentsByReferenceNumbers(rfs: string[]) {
    const payments = await this.pg.any<PaymentWithEvents>(sql`
      SELECT
        p.*,
        s.balance,
        s.status,
        s.payer,
        (SELECT payer_id FROM payment_debt_mappings pdm JOIN debt d ON pdm.debt_id = d.id WHERE pdm.payment_id = p.id LIMIT 1) AS payer_id,
        (SELECT ARRAY_AGG(TO_JSON(payment_events.*)) FROM payment_events WHERE payment_id = p.id) AS events,
        COALESCE(s.updated_at, p.created_at) AS updated_at
      FROM payments p
      JOIN payment_statuses s ON s.id = p.id
      WHERE p.data->>'reference_number' = ANY (${rfs.map(rf => rf.replace(/^0+/, ''))})
    `)

    return payments
  }

  async createPaymentEventFromTransaction(tx: BankTransaction) {
    const existing_mapping = await this.pg.one<DbPaymentEventTransactionMapping>(sql`
      SELECT *
      FROM payment_event_transaction_mapping
      WHERE bank_transaction_id = ${tx.id}
    `)

    if (existing_mapping) {
      console.log('Existing mapping')
      return null;
    }

    if (!tx.reference) {
      console.log('No reference')
      return null;
    }

    const [payment] = await this.getPaymentsByReferenceNumbers([tx.reference])

    if (!payment) {
      console.log('No match')
      return null;
    }

    return await this.createPaymentEvent(payment.id, {
      type: 'payment',
      amount: tx.amount,
      time: tx.date,
      transaction: tx.id,
    })
  }

  async createBankTransactionPaymentEvent(details: BankTransactionDetails) {
    const payments = await this.getPaymentsByReferenceNumbers([details.referenceNumber])

    if (payments.length === 0) {
      return null;
    }

    const [payment] = payments
    const already_exists = payment.events.some((event) => event.data?.accounting_id === details.accountingId)

    if (already_exists) {
      return null;
    }

    return await this.createPaymentEvent(payment.id, {
      type: 'payment',
      amount: details.amount,
      time: details.time,
      data: {
        accounting_id: details.accountingId,
      },
    })
  }
}
