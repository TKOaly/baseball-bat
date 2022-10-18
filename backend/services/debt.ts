import { euro, DbDebt, DbDebtComponent, NewDebtComponent, DebtComponent, Debt, NewDebt, internalIdentity, DbPayerProfile, PayerProfile, DbDebtCenter, DebtCenter, InternalIdentity, EuroValue, Email, DebtPatch } from '../../common/types'
import { PgClient } from '../db'
import sql from 'sql-template-strings'
import { Inject, Service } from 'typedi'
import { formatPayerProfile, PayerService } from './payer'
import { formatDebtCenter } from './debt_centers'
import { NewInvoice, PaymentService } from './payements'
import { cents } from '../../common/currency'

import * as E from 'fp-ts/lib/Either'
import * as TE from 'fp-ts/lib/TaskEither'
import * as A from 'fp-ts/lib/Array'
import * as T from 'fp-ts/lib/Task'
import * as S from 'fp-ts/lib/string'
import * as EQ from 'fp-ts/lib/Eq'
import { flow, pipe } from 'fp-ts/lib/function'
import { isPast } from 'date-fns'
import { EmailService } from './email'

const formatDebt = (debt: DbDebt & { payer?: [DbPayerProfile] | DbPayerProfile, debt_center?: DbDebtCenter, debt_components?: DbDebtComponent[], total?: number }): Debt & { payer?: PayerProfile, debtCenter?: DebtCenter, debtComponents: Array<DebtComponent> } => ({
  name: debt.name,
  id: debt.id,
  lastReminded: debt.last_reminded,
  payerId: internalIdentity(debt.payer_id),
  createdAt: debt.created_at,
  updatedAt: debt.updated_at,
  draft: debt.draft,
  description: debt.description,
  dueDate: debt.due_date,
  debtCenterId: debt.debt_center_id,
  debtCenter: debt.debt_center && formatDebtCenter(debt.debt_center),
  credited: debt.credited,
  total: debt.total === undefined ? undefined : cents(debt.total),
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

  @Inject(() => EmailService)
  emailService: EmailService

  async getDebt(id: string): Promise<Debt | null> {
    return this.pg
      .one<DbDebt>(sql`
        SELECT
          debt.*,
          TO_JSON(payer_profiles.*) AS payer,
          TO_JSON(debt_center.*) AS debt_center,
          CASE WHEN ( SELECT is_paid FROM debt_statuses ds WHERE ds.id = debt.id ) THEN 'paid' ELSE 'unpaid' END AS status,
          ARRAY_AGG(TO_JSON(debt_component.*)) AS debt_components,
          (
            SELECT SUM(dc.amount) AS total
            FROM debt_component_mapping dcm
            JOIN debt_component dc ON dc.id = dcm.debt_component_id
            WHERE dcm.debt_id = debt.id
          ) AS total
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

  async updateDebt(debt: DebtPatch): Promise<E.Either<Error, Debt>> {
    const payer = await this.payerService.getPayerProfileByIdentity(debt.payerId)
    const existingDebt = await this.getDebt(debt.id);

    if (!existingDebt) {
      return E.left(new Error('No such debt'));
    }

    if (!payer) {
      return E.left(new Error('No such payer'))
    }

    const query = sql`
      UPDATE debt
      SET
        name = ${debt.name},
        description = ${debt.description},
        debt_center_id = ${debt.centerId},
        payer_id = ${payer.id.value},
        due_date = ${debt.dueDate}
      WHERE
        id = ${debt.id}
      RETURNING *
    `

    const newComponents = pipe(
      debt.components,
      A.filter((id) => existingDebt.debtComponents.findIndex(x => x.id === id) === -1),
    )

    const removedComponents = pipe(
      existingDebt.debtComponents,
      A.filter(({ id }) => debt.components.findIndex(x => x === id) === -1),
      A.map(c => c.id),
    )

    const addComponents =
      A.traverse(TE.ApplicativePar)((id) => async (): Promise<E.Either<Error, null>> => {
        await this.pg.one(sql`
          INSERT INTO debt_component_mapping (debt_id, debt_component_id) VALUES (${debt.id}, ${id})
        `)

        return E.right(null)
      })

    const removeComponents =
      A.traverse(TE.ApplicativePar)((id) => async (): Promise<E.Either<Error, null>> => {
        await this.pg.one(sql`DELETE FROM debt_component_mapping WHERE debt_id = ${debt.id} AND debt_component_id = ${id}`)

        return E.right(null)
      })

    return pipe(
      this.pg.oneTask<DbDebt>(query),
      TE.chainEitherK(E.fromOption(() => new Error('No such debt'))),
      TE.map(formatDebt),
      TE.chainFirst(() => addComponents(newComponents)),
      TE.chainFirst(() => removeComponents(removedComponents))
    )()
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
        SUM(debt_component.amount) AS total,
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

  async getOverdueDebts() {
    const debts = await this.pg.any<DbDebt>(sql`
      SELECT
        debt.*,
        TO_JSON(payer_profiles.*) AS payer,
        TO_JSON(debt_center.*) AS debt_center,
        CASE WHEN EVERY(debt_statuses.is_paid) THEN 'paid' ELSE 'unpaid' END AS status,
        ARRAY_AGG(TO_JSON(debt_component.*)) AS debt_components,
        (
          SELECT SUM(dc.amount) AS total
          FROM debt_component_mapping dcm
          JOIN debt_component dc ON dc.id = dcm.debt_component_id
          WHERE dcm.debt_id = debt.id
        ) AS total
      FROM debt
      JOIN payer_profiles ON payer_profiles.id = debt.payer_id
      JOIN debt_center ON debt_center.id = debt.debt_center_id
      JOIN debt_statuses ON debt_statuses.id = debt.id
      LEFT JOIN debt_component_mapping ON debt_component_mapping.debt_id = debt.id
      LEFT JOIN debt_component ON debt_component_mapping.debt_component_id = debt_component.id
      WHERE debt.due_date < NOW() AND NOT debt.draft AND NOT debt_statuses.is_paid
      GROUP BY debt.id, payer_profiles.*, debt_center.*
    `)

    return debts.map(formatDebt)
  }

  async getDebtsPendingReminder() {
    const debts = await this.pg.any<DbDebt>(sql`
      SELECT
        debt.*,
        TO_JSON(payer_profiles.*) AS payer,
        TO_JSON(debt_center.*) AS debt_center,
        CASE WHEN EVERY(debt_statuses.is_paid) THEN 'paid' ELSE 'unpaid' END AS status,
        ARRAY_AGG(TO_JSON(debt_component.*)) AS debt_components,
        (
          SELECT SUM(dc.amount) AS total
          FROM debt_component_mapping dcm
          JOIN debt_component dc ON dc.id = dcm.debt_component_id
          WHERE dcm.debt_id = debt.id
        ) AS total
      FROM debt
      JOIN payer_profiles ON payer_profiles.id = debt.payer_id
      JOIN debt_center ON debt_center.id = debt.debt_center_id
      JOIN debt_statuses ON debt_statuses.id = debt.id
      LEFT JOIN debt_component_mapping ON debt_component_mapping.debt_id = debt.id
      LEFT JOIN debt_component ON debt_component_mapping.debt_component_id = debt_component.id
      WHERE debt.due_date < NOW() AND (debt.last_reminded IS NULL OR debt.last_reminded < NOW() - INTERVAL '1 month') AND NOT debt_statuses.is_paid
      GROUP BY debt.id, payer_profiles.*, debt_center.*
    `)

    return debts.map(formatDebt)
  }

  async setDebtLastReminded(id: string, lastReminded: Date) {
    await this.pg.any(sql`
      UPDATE debt SET last_reminded = ${lastReminded} WHERE id = ${id}
    `)
  }

  async sendReminder(debt: Debt, draft = true): Promise<E.Either<string, Email>> {
    if (debt.draft) {
      return E.left('Debt is a draft')
    }

    const email = await this.payerService.getPayerPrimaryEmail(debt.payerId)

    if (!email) {
      return E.left('No primary email for payer')
    }

    const payment = await this.paymentService.getDefaultInvoicePaymentForDebt(debt.id)

    if (!payment) {
      return E.left('No default invoice found for debt')
    }

    const dueDate = new Date(debt.dueDate)

    if (!isPast(dueDate)) {
      return E.left('Debt not due yet')
    }

    const createdEmail = await this.emailService.createEmail({
      recipient: email.email,
      subject: `[Maksumuistutus / Payment Notice] ${debt.name}`,
      template: 'reminder',
      payload: {
        dueDate: debt.dueDate,
        amount: debt.total,
        referenceNumber: payment.data.reference_number,
        message: payment.message ?? debt.description,
        title: debt.name,
        number: payment.payment_number,
        date: debt.createdAt,
      },
    })

    if (!createdEmail) {
      return E.left('Could not create email')
    }

    if (!draft) {
      await this.emailService.sendEmail(createdEmail.id);
      const refreshed = await this.emailService.getEmail(createdEmail.id);
      return E.right(refreshed!);
    }

    await this.setDebtLastReminded(debt.id, createdEmail.createdAt);

    return E.right(createdEmail)
  }

  async sendAllReminders(draft = true, ignoreReminderCooldown = false) {
    const debts = ignoreReminderCooldown
      ? await this.getOverdueDebts()
      : await this.getDebtsPendingReminder();

    const sendReminder = (debt: Debt) => T.map(E.map((e) => [e, debt] as [Email, Debt]))(() => this.sendReminder(debt, draft))

    return flow(
      A.traverse(T.ApplicativePar)(sendReminder),
      T.map(A.separate),
    )(debts)()
  }
}
