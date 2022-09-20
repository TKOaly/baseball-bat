import { euro, DbDebt, DbDebtComponent, NewDebtComponent, DebtComponent, Debt, NewDebt, internalIdentity, DbPayerProfile, PayerProfile, DbDebtCenter, DebtCenter, InternalIdentity, EuroValue } from '../../common/types'
import { PgClient } from '../db'
import sql from 'sql-template-strings'
import { Inject, Service } from 'typedi'
import { formatPayerProfile, PayerService } from './payer'
import { formatDebtCenter } from './debt_centers'
import { NewInvoice, PaymentService } from './payements'
import { cents } from '../../common/currency'

const formatDebt = (debt: DbDebt & { payer?: [DbPayerProfile] | DbPayerProfile, debt_center?: DbDebtCenter, debt_components?: DbDebtComponent[] }): Debt & { payer?: PayerProfile, debtCenter?: DebtCenter, debtComponents: Array<DebtComponent> } => ({
  name: debt.name,
  id: debt.id,
  payerId: internalIdentity(debt.payer_id),
  createdAt: debt.created_at,
  updatedAt: debt.updated_at,
  draft: debt.draft,
  description: debt.description,
  dueDate: debt.due_date,
  debtCenterId: debt.debt_center_id,
  debtCenter: debt.debt_center && formatDebtCenter(debt.debt_center),
  credited: debt.credited,
  debtComponents: debt.debt_components
    ? debt.debt_components.filter(c => c !== null).map(formatDebtComponent)
    : [],
  payer: debt.payer && (Array.isArray(debt.payer) ? formatPayerProfile(debt.payer[0]) : formatPayerProfile(debt.payer)),
  status: debt.status,
})

const formatDebtComponent = (debtComponent: DbDebtComponent): DebtComponent => ({
  id: debtComponent.id,
  name: debtComponent.name,
  amount: euro(debtComponent.amount / 100),
  description: debtComponent.description,
  debtCenterId: debtComponent.debt_center_id,
  updatedAt: debtComponent.updated_at,
  createdAt: debtComponent.created_at,
})

export type CreateDebtOptions = {
  noDefaultPayment?: boolean
  defaultPaymentReferenceNumber?: string
  paymentNumber?: string
}

@Service()
export class DebtService {
  @Inject(() => PgClient)
  pg: PgClient

  @Inject(() => PayerService)
  payerService: PayerService

  @Inject(() => PaymentService)
  paymentService: PaymentService

  async getDebt(id: string): Promise<Debt | null> {
    return this.pg
      .one<DbDebt>(sql`
        SELECT
          debt.*,
          TO_JSON(payer_profiles.*) AS payer,
          TO_JSON(debt_center.*) AS debt_center,
          CASE WHEN ( SELECT is_paid FROM debt_statuses ds WHERE ds.id = debt.id ) THEN 'paid' ELSE 'unpaid' END AS status,
          ARRAY_AGG(TO_JSON(debt_component.*)) AS debt_components
        FROM debt
        JOIN payer_profiles ON payer_profiles.id = debt.payer_id
        JOIN debt_center ON debt_center.id = debt.debt_center_id
        LEFT JOIN debt_component_mapping ON debt_component_mapping.debt_id = debt.id
        LEFT JOIN debt_component ON debt_component_mapping.debt_component_id = debt_component.id
        WHERE debt.id = ${id}
        GROUP BY debt.id, payer_profiles.*, debt_center.*
      `)
      .then(dbDebt => dbDebt && formatDebt(dbDebt))
  }

  async getDebtsByCenter(id: string): Promise<Debt[]> {
    return this.pg
      .any<DbDebt>(sql`
        SELECT
          debt.*,
          CASE WHEN ( SELECT is_paid FROM debt_statuses ds WHERE ds.id = debt.id ) THEN 'paid' ELSE 'unpaid' END AS status,
          ARRAY_AGG(TO_JSON(payer_profiles.*)) AS payer
        FROM debt
        INNER JOIN payer_profiles ON payer_profiles.id = debt.payer_id
        WHERE debt_center_id = ${id}
        GROUP BY debt.id
      `)
      .then(dbDebts => dbDebts.map(formatDebt))
  }

  async getDebts(): Promise<Debt[]> {
    return this.pg
      .any<DbDebt>(sql`
        SELECT
          debt.*,
          CASE WHEN ( SELECT is_paid FROM debt_statuses ds WHERE ds.id = debt.id ) THEN 'paid' ELSE 'unpaid' END AS status,
          TO_JSON(payer_profiles.*) AS payer
        FROM debt
        JOIN payer_profiles ON payer_profiles.id = debt.payer_id
      `)
      .then(dbDebts => dbDebts.map(formatDebt))
  }

  async getDebtComponentsByCenter(id: string): Promise<DebtComponent[]> {
    const components = await this.pg.any<DbDebtComponent>(sql`
      SELECT * FROM debt_component WHERE debt_center_id = ${id}
    `)

    return components.map(formatDebtComponent)
  }

  async publishDebt(debtId: string): Promise<void> {
    await this.pg.any(sql`UPDATE debt SET draft = false WHERE id = ${debtId}`)
  }

  async createDebt(debt: NewDebt, options?: CreateDebtOptions): Promise<Debt> {
    const payerProfile = await this.payerService.getPayerProfileByIdentity(debt.payer);

    if (!payerProfile) {
      throw new Error('No such payer: ' + debt.payer.value)
    }

    const created = await this.pg
      .one<DbDebt>(sql`
        INSERT INTO debt (name, description, debt_center_id, payer_id, due_date)
        VALUES (
          ${debt.name},
          ${debt.description},
          ${debt.centerId},
          ${payerProfile.id.value},
          ${debt.dueDate}
        )
        RETURNING *
      `);

    if (created === null) {
      throw new Error('Could not create debt')
    }

    await Promise.all(
      debt.components.map(async (component) => {
        try {
          await this.pg
            .any(sql`
                INSERT INTO debt_component_mapping (debt_id, debt_component_id)
                VALUES (${created.id}, ${component})
            `)
        } catch (e) {
          console.log(e, created, component)
          throw e
        }
      })
    );

    if (!options?.noDefaultPayment) {
      let invoiceOptions: Partial<NewInvoice> = {}

      if (options?.paymentNumber) {
        invoiceOptions.paymentNumber = options.paymentNumber
      }

      if (options?.defaultPaymentReferenceNumber) {
        invoiceOptions.referenceNumber = options.defaultPaymentReferenceNumber
      }

      await this.paymentService.createInvoice({
        series: 1,
        message: debt.description,
        debts: [created.id],
        title: debt.name,
        ...invoiceOptions,
      })
    }

    return formatDebt(created);
  }

  async createDebtComponent(debtComponent: NewDebtComponent): Promise<DebtComponent> {
    return this.pg
      .one<DbDebtComponent>(sql`
        INSERT INTO debt_component (name, amount, debt_center_id)
        VALUES (${debtComponent.name}, ${debtComponent.amount.value}, ${debtComponent.debtCenterId})
        RETURNING *
      `)
      .then(dbDebtComponent => {
        if (!dbDebtComponent) {
          throw new Error('Expected value to be returned from the database');
        }

        return formatDebtComponent(dbDebtComponent)
      })
  }

  async getDebtsByPayment(paymentId: string): Promise<Array<Debt>> {
    return this.pg
      .any<DbDebt>(sql`
        SELECT
          debt.*,
          TO_JSON(payer_profiles.*) AS payer,
          TO_JSON(debt_center.*) AS debt_center,
          CASE WHEN ( SELECT is_paid FROM debt_statuses ds WHERE ds.id = debt.id ) THEN 'paid' ELSE 'unpaid' END AS status,
          ARRAY_AGG(TO_JSON(debt_component.*)) AS debt_components
        FROM payment_debt_mappings pdm
        JOIN debt ON debt.id = pdm.debt_id
        JOIN payer_profiles ON payer_profiles.id = debt.payer_id
        JOIN debt_center ON debt_center.id = debt.debt_center_id
        LEFT JOIN debt_component_mapping ON debt_component_mapping.debt_id = debt.id
        LEFT JOIN debt_component ON debt_component_mapping.debt_component_id = debt_component.id
        WHERE pdm.payment_id = ${paymentId}
        GROUP BY debt.id, payer_profiles.*, debt_center.*
      `)
      .then(dbDebts => dbDebts && dbDebts.map(formatDebt))

  }

  async getDebtsByPayer(id: InternalIdentity, { includeDrafts = false, includeCredited = false } = {}) {
    const result = await this.pg.any<DbDebt>(sql`
      SELECT
        debt.*,
        TO_JSON(payer_profiles.*) AS payer,
        TO_JSON(debt_center.*) AS debt_center,
          CASE WHEN ( SELECT is_paid FROM debt_statuses ds WHERE ds.id = debt.id ) THEN 'paid' ELSE 'unpaid' END AS status,
        ARRAY_AGG(TO_JSON(debt_component.*)) AS debt_components
      FROM debt
      JOIN payer_profiles ON payer_profiles.id = debt.payer_id
      JOIN debt_center ON debt_center.id = debt.debt_center_id
      LEFT JOIN debt_component_mapping ON debt_component_mapping.debt_id = debt.id
      LEFT JOIN debt_component ON debt_component_mapping.debt_component_id = debt_component.id
      WHERE debt.payer_id = ${id.value} AND (${includeDrafts} OR NOT debt.draft) AND (${includeDrafts} OR NOT debt.credited)
      GROUP BY debt.id, payer_profiles.*, debt_center.*
    `);

    return result.map(formatDebt);
  }

  async getDebtTotal(id: string): Promise<EuroValue> {
    const result = await this.pg.one<{ total: number }>(sql`
      SELECT SUM(dc.amount) AS total
      FROM debt_component_mapping dcm
      JOIN debt_component dc ON dc.id = dcm.debt_component_id
      WHERE dcm.debt_id = ${id}
    `)

    if (!result) {
      throw new Error('no such debt')
    }

    return cents(result.total)
  }

  async deleteDebt(id: string) {
    const debt = await this.getDebt(id)

    if (!debt) {
      throw new Error('Debt not found')
    }

    if (!debt.draft) {
      throw new Error('Cannot delete published debts')
    }

    await this.pg.tx(async (tx) => {
      await tx.do(sql`DELETE FROM debt_component_mapping WHERE debt_id = ${id}`)
      await tx.do(sql`DELETE FROM debt WHERE id = ${id}`)
    })
  }

  async creditDebt(id: string) {
    const debt = await this.getDebt(id)

    if (!debt) {
      throw new Error('Debt not found')
    }

    if (debt.draft) {
      throw new Error('Cannot credit unpublished debts')
    }

    await this.pg.tx(async (tx) => {
      await tx.do(sql`UPDATE debt SET credited = true WHERE id = ${id} `)
      await tx.do(sql`UPDATE payments SET credited = true WHERE id IN (SELECT payment_id FROM payment_debt_mappings WHERE debt_id = ${id})`)
    })
  }
}
