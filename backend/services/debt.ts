import { euro, DbDebt, DbDebtComponent, NewDebtComponent, DebtComponent, Debt, NewDebt, internalIdentity, DbPayerProfile, PayerProfile, DbDebtCenter, DebtCenter, InternalIdentity, EuroValue, Email, DebtPatch, DebtComponentPatch, isPaymentInvoice, Payment, PaymentEvent, DbDebtTag, DebtTag } from '../../common/types';
import { PgClient } from '../db';
import sql, { SQLStatement } from 'sql-template-strings';
import { Inject, Service } from 'typedi';
import { formatPayerProfile, PayerService } from './payer';
import { formatDebtCenter } from './debt_centers';
import { NewInvoice, PaymentService } from './payements';
import { cents } from '../../common/currency';

import * as E from 'fp-ts/lib/Either';
import * as TE from 'fp-ts/lib/TaskEither';
import * as A from 'fp-ts/lib/Array';
import * as T from 'fp-ts/lib/Task';
import { flow, pipe } from 'fp-ts/lib/function';
import { isPast, parseISO } from 'date-fns';
import { EmailService } from './email';

const formatDebtTag = (tag: DbDebtTag): DebtTag => ({
  name: tag.name,
  hidden: tag.hidden,
});

const formatDebt = (debt: DbDebt & { payer?: [DbPayerProfile] | DbPayerProfile, debt_center?: DbDebtCenter, debt_components?: DbDebtComponent[], total?: number }): Debt & { payer?: PayerProfile, debtCenter?: DebtCenter, debtComponents: Array<DebtComponent> } => ({
  name: debt.name,
  id: debt.id,
  date: debt.date,
  lastReminded: debt.last_reminded,
  payerId: internalIdentity(debt.payer_id),
  createdAt: debt.created_at,
  updatedAt: debt.updated_at,
  draft: debt.published_at === null,
  description: debt.description,
  dueDate: debt.due_date,
  publishedAt: debt.published_at,
  debtCenterId: debt.debt_center_id,
  defaultPayment: debt.default_payment,
  debtCenter: debt.debt_center && formatDebtCenter(debt.debt_center),
  credited: debt.credited,
  total: debt.total === undefined ? undefined : cents(debt.total),
  paymentCondition: debt.payment_condition,
  debtComponents: debt.debt_components
    ? debt.debt_components.filter(c => c !== null).map(formatDebtComponent)
    : [],
  payer: debt.payer && (Array.isArray(debt.payer) ? formatPayerProfile(debt.payer[0]) : formatPayerProfile(debt.payer)),
  status: debt.status,
  tags: debt.tags.map(formatDebtTag),
});

const formatDebtComponent = (debtComponent: DbDebtComponent): DebtComponent => ({
  id: debtComponent.id,
  name: debtComponent.name,
  amount: euro(debtComponent.amount / 100),
  description: debtComponent.description,
  debtCenterId: debtComponent.debt_center_id,
  updatedAt: debtComponent.updated_at,
  createdAt: debtComponent.created_at,
});

export type CreateDebtOptions = {
  defaultPayment?: Partial<NewInvoice>
}

@Service()
export class DebtService {
  @Inject(() => PgClient)
  pg: PgClient;

  @Inject(() => PayerService)
  payerService: PayerService;

  @Inject(() => PaymentService)
  paymentService: PaymentService;

  @Inject(() => EmailService)
  emailService: EmailService;

  private async queryDebts(where?: SQLStatement): Promise<Array<Debt>> {
    let query = sql`
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
        ) AS total,
        ARRAY_REMOVE(ARRAY_AGG(DISTINCT TO_JSONB(debt_tags.*)), NULL) AS tags
      FROM debt
      JOIN payer_profiles ON payer_profiles.id = debt.payer_id
      JOIN debt_center ON debt_center.id = debt.debt_center_id
      LEFT JOIN debt_component_mapping ON debt_component_mapping.debt_id = debt.id
      LEFT JOIN debt_component ON debt_component_mapping.debt_component_id = debt_component.id
      LEFT JOIN debt_tags ON debt_tags.debt_id = debt.id
    `;

    if (where) {
      query = query.append(' WHERE ').append(where).append(' ');
    }

    query.append(sql`GROUP BY debt.id, payer_profiles.*, debt_center.*, debt_tags.name`);

    return this.pg
      .any<DbDebt>(query)
      .then(debts => debts.map(formatDebt));
  }

  async getDebt(id: string): Promise<Debt | null> {
    const [debts] = await this.queryDebts(sql`debt.id = ${id}`);
    return debts;
  }

  async getDebtsByCenter(id: string): Promise<Debt[]> {
    return this.queryDebts(sql`debt.debt_center_id = ${id}`);
  }

  async getDebts(): Promise<Debt[]> {
    return this.queryDebts();
  }

  async getDebtComponentsByCenter(id: string): Promise<DebtComponent[]> {
    const components = await this.pg.any<DbDebtComponent>(sql`
      SELECT * FROM debt_component WHERE debt_center_id = ${id}
    `);

    return components.map(formatDebtComponent);
  }

  async publishDebt(debtId: string): Promise<void> {
    await this.pg.any(sql`
      UPDATE debt
      SET
        published_at = NOW(),
        date = COALESCE(date, NOW()),
        due_date = COALESCE(due_date, NOW() + MAKE_INTERVAL(days => payment_condition))
      WHERE id = ${debtId}
    `);
  }

  async setDefaultPayment(debtId: string, paymentId: string) {
    await this.pg.any(sql`
      UPDATE debt SET default_payment = ${paymentId} WHERE id = ${debtId}
    `);
  }

  async createDebt(debt: NewDebt, options?: CreateDebtOptions): Promise<Debt> {
    const payerProfile = await this.payerService.getPayerProfileByIdentity(debt.payer);

    if (!payerProfile) {
      throw new Error('No such payer: ' + debt.payer.value);
    }

    const created = await this.pg.tx(async (tx) => {
      const [created] = await tx 
        .do<DbDebt>(sql`
          INSERT INTO debt (name, description, debt_center_id, payer_id, due_date, created_at, payment_condition, published_at, date)
          VALUES (
            ${debt.name},
            ${debt.description},
            ${debt.centerId},
            ${payerProfile.id.value},
            ${debt.dueDate},
            COALESCE(${debt.createdAt}, NOW()),
            ${debt.paymentCondition},
            ${debt.publishedAt},
            ${debt.date}
          )
          RETURNING *
        `);

        const tags = (await Promise.all(debt.tags.map((tag) => tx.do<DbDebtTag>(sql`
          INSERT INTO debt_tags (debt_id, name, hidden) VALUES (${created.id}, ${tag.name}, ${tag.hidden}) RETURNING *;
        `)))).flat();

        return { ...created, tags };
    });

    if (created === null) {
      throw new Error('Could not create debt');
    }

    await Promise.all(
      debt.components.map(async (component) => {
        try {
          await this.pg
            .any(sql`
                INSERT INTO debt_component_mapping (debt_id, debt_component_id)
                VALUES (${created.id}, ${component})
            `);
        } catch (e) {
          throw e;
        }
      }),
    );

    if (options?.defaultPayment) {
      const payment = await this.paymentService.createInvoice({
        series: 1,
        message: debt.description,
        debts: [created.id],
        title: debt.name,
        date: debt.date ? parseISO(debt.date) : undefined,
        ...options.defaultPayment,
      }, {
        sendNotification: false,
      });

      await this.setDefaultPayment(created.id, payment.id);
    }

    return formatDebt(created);
  }

  async updateDebt(debt: DebtPatch): Promise<E.Either<Error, Debt>> {
    const existingDebt = await this.getDebt(debt.id);

    if (!existingDebt) {
      return E.left(new Error('No such debt'));
    }

    if (debt.payerId) {
      const payer = await this.payerService.getPayerProfileByIdentity(debt.payerId);

      if (!payer) {
        return E.left(new Error('No such payer'));
      }
    }

    const update = (table: string, condition: SQLStatement, values: Record<string, any>) => {
      let query = sql`UPDATE `.append(table).append(' SET ');

      let first = true;

      for (const [column, value] of Object.entries(values)) {
        if (value !== undefined) {
          if (!first) {
            query = query.append(', ');
          }

          query = query.append(column).append(sql` = ${value}`);
        }

        first = false;
      }

      query = query.append(' WHERE ').append(condition).append(' RETURNING *');

      return query;
    };

    let due_date: Date | null | undefined = debt.dueDate;
    let payment_condition: number | null | undefined = debt.paymentCondition;

    if (due_date) {
      payment_condition = null;
    } else if (payment_condition) {
      due_date = null;
    }

    const query = update('debt', sql`id = ${debt.id}`, {
      name: debt.name,
      description: debt.description,
      debt_center_id: debt.centerId,
      payer_id: debt.payerId?.value,
      due_date,
      date: debt.date,
      payment_condition,
    });

    let handleComponents: TE.TaskEither<Error, null> = async () => E.right(null);

    if (debt.components) {
      const components = debt.components;

      const newComponents = pipe(
        debt.components,
        A.filter((id) => existingDebt.debtComponents.findIndex(x => x.id === id) === -1),
      );

      const removedComponents = pipe(
        existingDebt.debtComponents,
        A.filter(({ id }) => components.findIndex(x => x === id) === -1),
        A.map(c => c.id),
      );

      const addComponents =
        A.traverse(TE.ApplicativePar)((id) => async (): Promise<E.Either<Error, null>> => {
          await this.pg.one(sql`
            INSERT INTO debt_component_mapping (debt_id, debt_component_id) VALUES (${debt.id}, ${id})
          `);

          return E.right(null);
        });

      const removeComponents =
        A.traverse(TE.ApplicativePar)((id) => async (): Promise<E.Either<Error, null>> => {
          await this.pg.one(sql`DELETE FROM debt_component_mapping WHERE debt_id = ${debt.id} AND debt_component_id = ${id}`);

          return E.right(null);
        });

      handleComponents = pipe(
        addComponents(newComponents),
        TE.chain(() => removeComponents(removedComponents)),
        TE.map(() => null),
      );
    }

    return pipe(
      this.pg.oneTask<DbDebt>(query),
      TE.chainEitherK(E.fromOption(() => new Error('No such debt'))),
      TE.map((debt) => ({
        ...debt,
        tags: [],
      })),
      TE.map(formatDebt),
      TE.chainFirst(() => handleComponents),
    )();
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

        return formatDebtComponent(dbDebtComponent);
      });
  }

  async deleteDebtComponent(debtCenterId: string, debtComponentId: string) {
    return await this.pg.tx(async (tx) => {
      const [{ exists }] = await tx.do<{ exists: boolean }>(sql`
        SELECT
          EXISTS(
            SELECT *
            FROM debt_component
            WHERE id = ${debtComponentId} AND
                  debt_center_id = ${debtCenterId}
          ) AS exists
      `);

      if (!exists) {
        return E.left(new Error('No such debt component'));
      }

      const result = await tx.do<{ debt_id: string }>(sql`
        DELETE FROM debt_component_mapping
        WHERE debt_component_id = ${debtComponentId}
        RETURNING debt_id 
      `);

      await tx.do(sql`
        DELETE FROM debt_component
        WHERE id = ${debtComponentId} AND debt_center_id = ${debtCenterId}
      `);

      return E.right({
        affectedDebts: result.map(r => r.debt_id),
      });
    });
  }

  async updateDebtComponent(debtCenterId: string, debtComponentId: string, patch: DebtComponentPatch) {
    const updated = await this.pg.one<DbDebtComponent>(sql`
      UPDATE debt_component
      SET
        name = COALESCE(${patch.name}, name),
        amount = COALESCE(${patch.amount?.value}, amount)
      WHERE id = ${debtComponentId} AND debt_center_id = ${debtCenterId}
      RETURNING *
    `);

    if (!updated) {
      return null;
    }

    return formatDebtComponent(updated);
  }

  async getDebtsByPayment(paymentId: string): Promise<Array<Debt>> {
    return this.pg
      .any<DbDebt>(sql`
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
          ) AS total,
          ARRAY_REMOVE(ARRAY_AGG(TO_JSONB(debt_tags.*)), NULL) AS tags
        FROM payment_debt_mappings pdm
        JOIN debt ON debt.id = pdm.debt_id
        JOIN payer_profiles ON payer_profiles.id = debt.payer_id
        JOIN debt_center ON debt_center.id = debt.debt_center_id
        LEFT JOIN debt_component_mapping ON debt_component_mapping.debt_id = debt.id
        LEFT JOIN debt_component ON debt_component_mapping.debt_component_id = debt_component.id
        LEFT JOIN debt_tags ON debt_tags.debt_id = debt.id
        WHERE pdm.payment_id = ${paymentId}
        GROUP BY debt.id, payer_profiles.*, debt_center.*
      `)
      .then(dbDebts => dbDebts && dbDebts.map(formatDebt));

  }

  async getDebtsByPayer(id: InternalIdentity, { includeDrafts = false, includeCredited = false } = {}) {
    const result = await this.pg.any<DbDebt>(sql`
      SELECT
        debt.*,
        TO_JSON(payer_profiles.*) AS payer,
        TO_JSON(debt_center.*) AS debt_center,
        SUM(debt_component.amount) AS total,
        CASE WHEN ( SELECT is_paid FROM debt_statuses ds WHERE ds.id = debt.id ) THEN 'paid' ELSE 'unpaid' END AS status,
        ARRAY_AGG(TO_JSON(debt_component.*)) AS debt_components,
        ARRAY_REMOVE(ARRAY_AGG(TO_JSONB(debt_tags.*)), NULL) AS tags
      FROM debt
      JOIN payer_profiles ON payer_profiles.id = debt.payer_id
      JOIN debt_center ON debt_center.id = debt.debt_center_id
      LEFT JOIN debt_component_mapping ON debt_component_mapping.debt_id = debt.id
      LEFT JOIN debt_component ON debt_component_mapping.debt_component_id = debt_component.id
      LEFT JOIN debt_tags ON debt_tags.debt_id = debt.id
      WHERE debt.payer_id = ${id.value} AND (${includeDrafts} OR debt.published_at IS NOT NULL) AND (${includeCredited} OR NOT debt.credited)
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
    `);

    if (!result) {
      throw new Error('no such debt');
    }

    return cents(result.total);
  }

  async deleteDebt(id: string) {
    const debt = await this.getDebt(id);

    if (!debt) {
      throw new Error('Debt not found');
    }

    if (!debt.draft) {
      throw new Error('Cannot delete published debts');
    }

    await this.pg.tx(async (tx) => {
      await tx.do(sql`DELETE FROM debt_component_mapping WHERE debt_id = ${id}`);
      await tx.do(sql`DELETE FROM debt WHERE id = ${id}`);
    });
  }

  async creditDebt(id: string) {
    const debt = await this.getDebt(id);

    if (!debt) {
      throw new Error('Debt not found');
    }

    if (debt.draft) {
      throw new Error('Cannot credit unpublished debts');
    }

    await this.pg.tx(async (tx) => {
      await tx.do(sql`UPDATE debt SET credited = true WHERE id = ${id} `);
      await tx.do(sql`UPDATE payments SET credited = true WHERE id IN (SELECT payment_id FROM payment_debt_mappings WHERE debt_id = ${id})`);
    });
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
      WHERE debt.due_date < NOW() AND debt.published_at IS NOT NULL AND NOT debt_statuses.is_paid
      GROUP BY debt.id, payer_profiles.*, debt_center.*
    `);

    return debts.map(formatDebt);
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
      WHERE debt.due_date < NOW()
        AND debt.published_at IS NOT NULL
        AND (debt.last_reminded IS NULL OR debt.last_reminded < NOW() - INTERVAL '1 month')
        AND NOT debt_statuses.is_paid
      GROUP BY debt.id, payer_profiles.*, debt_center.*
    `);

    return debts.map(formatDebt);
  }

  async setDebtLastReminded(id: string, lastReminded: Date) {
    await this.pg.any(sql`
      UPDATE debt SET last_reminded = ${lastReminded} WHERE id = ${id}
    `);
  }

  async sendReminder(debt: Debt, draft = true): Promise<E.Either<string, Email>> {
    if (debt.draft) {
      return E.left('Debt is a draft');
    }

    const email = await this.payerService.getPayerPrimaryEmail(debt.payerId);

    if (!email) {
      return E.left('No primary email for payer');
    }

    const payment = await this.paymentService.getDefaultInvoicePaymentForDebt(debt.id);

    if (!payment || !isPaymentInvoice(payment)) {
      return E.left('No default invoice found for debt');
    }

    const dueDate = debt.dueDate ? new Date(debt.dueDate) : null;

    if (dueDate === null || !isPast(dueDate)) {
      return E.left('Debt not due yet');
    }

    const createdEmail = await this.emailService.createEmail({
      recipient: email.email,
      subject: `[Maksumuistutus / Payment Notice] ${debt.name}`,
      template: 'reminder',
      payload: {
        title: payment.title,
        number: payment.paymentNumber,
        date: parseISO(payment.data.date),
        dueDate: parseISO(payment.data.due_date),
        amount: debt.total,
        debts: [debt],
        referenceNumber: payment.data.reference_number,
        message: payment.message,
      },
    });

    if (!createdEmail) {
      return E.left('Could not create email');
    }

    if (!draft) {
      await this.emailService.sendEmail(createdEmail.id);
      const refreshed = await this.emailService.getEmail(createdEmail.id);

      return E.fromNullable('Could not fetch new email details')(refreshed);
    }

    await this.setDebtLastReminded(debt.id, createdEmail.createdAt);

    return E.right(createdEmail);
  }

  async sendAllReminders(draft = true, ignoreReminderCooldown = false) {
    const debts = ignoreReminderCooldown
      ? await this.getOverdueDebts()
      : await this.getDebtsPendingReminder();

    const sendReminder = (debt: Debt) => T.map(E.map((e) => [e, debt] as [Email, Debt]))(() => this.sendReminder(debt, draft));

    const result = await flow(
      A.traverse(T.ApplicativePar)(sendReminder),
      T.map(A.separate),
    )(debts)();

    return result;
  }

  async onDebtPaid(debt: Debt, payment: Payment, _event: PaymentEvent) {
    const payments = await this.paymentService.getPaymentsContainingDebt(debt.id);

    const promises = payments
      .filter((p) => p.id !== payment.id)
      .map(async (payment) => {
        if (payment.type === 'invoice') {
          await this.paymentService.creditPayment(payment.id, 'paid');
        }
      });

    await Promise.all(promises);
  }
}
