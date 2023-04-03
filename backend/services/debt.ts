import { euro, DbDebt, DbDebtComponent, NewDebtComponent, DebtComponent, Debt, NewDebt, internalIdentity, DbPayerProfile, PayerProfile, DbDebtCenter, DebtCenter, InternalIdentity, EuroValue, Email, DebtPatch, DebtComponentPatch, isPaymentInvoice, Payment, PaymentEvent, DbDebtTag, DebtTag, DbDateString, tkoalyIdentity, emailIdentity, DateString, convertToDbDate, DebtStatusReportOptions } from '../../common/types';
import { PgClient } from '../db';
import sql, { SQLStatement } from 'sql-template-strings';
import * as R from 'remeda';
import * as t from 'io-ts';
import { Inject, Service } from 'typedi';
import { formatPayerProfile, PayerService } from './payer';
import { DebtCentersService, formatDebtCenter } from './debt_centers';
import { DbPayment, formatPayment, NewInvoice, PaymentService } from './payements';
import { cents } from '../../common/currency';

import * as E from 'fp-ts/lib/Either';
import * as TE from 'fp-ts/lib/TaskEither';
import * as A from 'fp-ts/lib/Array';
import * as T from 'fp-ts/lib/Task';
import { toArray } from 'fp-ts/Record';
import { flow, pipe } from 'fp-ts/lib/function';
import { addDays, format, isPast, parseISO } from 'date-fns';
import { EmailService } from './email';
import { groupBy } from 'fp-ts/lib/NonEmptyArray';
import { ReportService } from './reports';
import { JobService } from './jobs';
import { Job, Queue } from 'bullmq';
import { validate } from 'uuid';
import { AccountingService } from './accounting';
import { UsersService } from './users';

const formatDebtTag = (tag: DbDebtTag): DebtTag => ({
  name: tag.name,
  hidden: tag.hidden,
});

const resolveDueDate = (debt: DbDebt) => {
  if (debt.due_date) {
    return debt.due_date;
  }

  if (debt.published_at && debt.payment_condition !== null) {
    return addDays(debt.published_at, debt.payment_condition);
  }

  return null;
}

export const formatDebt = (debt: DbDebt & { payer?: [DbPayerProfile] | DbPayerProfile, debt_center?: DbDebtCenter, debt_components?: DbDebtComponent[], total?: number }): Debt & { payer?: PayerProfile, debtCenter?: DebtCenter, debtComponents: Array<DebtComponent> } => ({
  name: debt.name,
  id: debt.id,
  humanId: debt.human_id,
  accountingPeriod: debt.accounting_period,
  date: debt.date,
  lastReminded: debt.last_reminded,
  payerId: internalIdentity(debt.payer_id),
  createdAt: debt.created_at,
  updatedAt: debt.updated_at,
  draft: debt.published_at === null,
  description: debt.description,
  dueDate: resolveDueDate(debt),
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
  tags: (debt.tags ?? []).map(formatDebtTag),
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

export type DebtLedgerOptions = {
  startDate: Date
  endDate: Date
  includeDrafts: 'include' | 'exclude' | 'only-drafts'
  groupBy: null | 'center' | 'payer'
  centers: null | Array<string>
}

type DebtCreationDetails = Partial<{
  tkoalyUserId: number,
  debtCenter: string,
  title: string,
  description: string,
  email: string,
  date: DateString,
  amount: EuroValue,
  dueDate: DateString,
  publishedAt: DateString,
  paymentCondition: number,
  components: string[],
  paymentNumber: string,
  referenceNumber: string,
  tags: string[],
  accountingPeriod: number,
}>;
type DebtJobResult = { result: 'success', data: any } | { result: 'error', soft: boolean, message: string, code: string, stack?: string };
type DebtJobName = 'create' | 'batch';
type DebtJobDefinition = {
  details: DebtCreationDetails,
  token: string,
  dryRun: boolean,
  components: {
    name: string,
    amount: EuroValue,
  }[],
};

@Service()
export class DebtService {
  @Inject(() => PgClient)
  pg: PgClient;

  @Inject(() => DebtCentersService)
  debtCentersService: DebtCentersService;

  @Inject(() => DebtService)
  debtService: DebtService;

  @Inject(() => AccountingService)
  accountingService: AccountingService;

  @Inject(() => ReportService)
  reportService: ReportService;

  @Inject(() => PayerService)
  payerService: PayerService;

  @Inject(() => PaymentService)
  paymentService: PaymentService;

  @Inject(() => EmailService)
  emailService: EmailService;

  @Inject(() => UsersService)
  usersService: UsersService;

  jobQueue: Queue<DebtJobDefinition, DebtJobResult, DebtJobName>;

  constructor(@Inject() public jobService: JobService) {
    this.jobService.createWorker('debts', this.handleDebtJob.bind(this));
    this.jobQueue = this.jobService.getQueue('debts');
  }

  private async resolvePayer(
    { email, name, tkoalyUserId }: { email?: string, name?: string, tkoalyUserId?: number },
    token: string,
    dryRun: boolean,
  ): Promise<PayerProfile | null> {
    if (tkoalyUserId) {
      const payer = await this.payerService.getPayerProfileByTkoalyIdentity(tkoalyIdentity(tkoalyUserId));

      if (payer) {
        return payer;
      }
    }

    if (email) {
      const payer = await this.payerService.getPayerProfileByEmailIdentity(emailIdentity(email));

      if (payer) {
        return payer;
      }

      const user = await this.usersService.getUpstreamUserByEmail(email, token);

      if (user) {
        if (dryRun) {
          return {
            id: internalIdentity(''),
            email: user.email,
            emails: [],
            name: user.screenName,
            tkoalyUserId: tkoalyIdentity(user.id),
            createdAt: new Date(),
            updatedAt: new Date(),
            stripeCustomerId: '',
            disabled: false,
          };
        } else {
          return await this.payerService.createPayerProfileFromTkoalyIdentity(tkoalyIdentity(user.id), token);
        }
      }

      if (name) {
        if (dryRun) {
          return {
            id: internalIdentity(''),
            email,
            name,
            createdAt: new Date(),
            updatedAt: new Date(),
            emails: [],
            stripeCustomerId: '',
            disabled: false,
          };
        } else {
          const payer = await this.payerService.createPayerProfileFromEmailIdentity(emailIdentity(email), { name });
          return payer;
        }
      }
    }

    return null;
  }

  private async resolveDebtCenter(debtCenter: string, dryRun: boolean, accountingPeriod: number) {
    if (validate(debtCenter)) {
      const byId = await this.debtCentersService.getDebtCenter(debtCenter);
      return byId;
    }

    const byName = await this.debtCentersService.getDebtCenterByName(debtCenter);

    if (byName) {
      return byName;
    }

    if (dryRun) {
      return {
        id: '',
        name: debtCenter,
        accountingPeriod,
        description: '',
        url: '',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    } else {
      return await this.debtCentersService.createDebtCenter({
        name: debtCenter,
        accountingPeriod,
        description: '',
        url: '',
      });
    }
  };

  private async handleDebtJob(job: Job<DebtJobDefinition,  DebtJobResult, string>): Promise<DebtJobResult> {
    if (job.name === 'create') {
      await new Promise((resolve) => setTimeout(resolve, 100));

      const missingField = (field: string): DebtJobResult & { result: 'error' } => ({
        result: 'error',
        soft: true,
        code: 'MISSING_FIELD',
        message: `Required field "${field}" not specified.`,
      });

      try {
        const { details, token, components, dryRun } = job.data;

        const payer = await this.resolvePayer(details, token, dryRun);

        if (!payer && !details.email) {
          return {
            result: 'error',
            soft: true,
            code: 'NO_PAYER_OR_EXPLICIT_EMAIL',
            message: `Cannot create debt without sufficient payer information.`,
          };
        }

        let email = details.email;
        let emailSource = 'explicit';

        if (!email && payer) {
          const primary = await this.payerService.getPayerPrimaryEmail(payer.id);

          if (!primary) {
            return {
              result: 'error',
              soft: true,
              code: 'PAYER_HAS_NO_EMAIL',
              message: `Could not resolve an email address for the payer.`,
            }
          }

          email = primary.email;
          emailSource = 'profile';
        }

        if (!details.title) {
          return missingField('title');
        }

        if (!details.description) {
          details.description = '';
        }

        if (!details.debtCenter) {
          return missingField('debtCenter');
        }

        if (!details.accountingPeriod) {
          return missingField('accountingPeriod');
        }

        const accountingPeriodOpen = await this.accountingService.isAccountingPeriodOpen(details.accountingPeriod);

        if (!accountingPeriodOpen) {
          return {
            result: 'error',
            soft: true,
            code: 'ACCOUNTING_PERIOD_CLOSED',
            message: `The specified accounting period (${details.accountingPeriod}) is not open.`,
          };
        }

        const debtCenter = await this.resolveDebtCenter(details.debtCenter, dryRun, details.accountingPeriod);

        if (!debtCenter) {
          return {
            result: 'error',
            soft: true,
            code: 'COULD_NOT_RESOLVE_DEBT_CENTER',
            message: `Could not resolve debt center for the debt.`,
          }
        }

        let dueDate = null;

        if (details.dueDate) {
          dueDate = convertToDbDate(details.dueDate);

          if (!dueDate) {
            return {
              result: 'error',
              soft: true,
              code: 'INVALID_VALUE',
              message: `Invalid value provided for the field "dueDate".`,
            };
          }
        }

        let date = null;

        if (details.date) {
          date = convertToDbDate(details.date);

          if (!date) {
            return {
              result: 'error',
              soft: true,
              code: 'INVALID_VALUE',
              message: `Invalid value provided for the field "date".`,
            };
          }
        }

        let publishedAt = null;

        if (details.publishedAt) {
          publishedAt = convertToDbDate(details.publishedAt);

          if (!publishedAt) {
            return {
              result: 'error',
              soft: true,
              code: 'INVALID_VALUE',
              message: `Invalid value provided for the field "publishedAt".`,
            };
          }
        }

        let paymentCondition = details.paymentCondition;

        if (dueDate && paymentCondition) {
          return {
            result: 'error',
            soft: true,
            code: 'BOTH_DUE_DATE_AND_CONDITION',
            message: `Both a due date and a payment condition were specified for the same debt.`,
          };
        } else if (!dueDate && !paymentCondition) {
          const zero = t.Int.decode(0);

          if (E.isRight(zero)) {
            paymentCondition = zero.right;
          } else {
            throw Error('Unreachable.');
          }
        }

        let createdDebt: Debt | null = null;
        let debtComponents: Array<DebtComponent> = [];

        if (!dryRun) {
          if (!payer) {
            return {
              result: 'error',
              soft: true,
              code: 'NO_PAYER',
              message: `No payer could be resolved for the debt.`,
            };
          }

          const existingDebtComponents = await this.debtService.getDebtComponentsByCenter(debtCenter.id as any);

          debtComponents = await Promise.all((details?.components ?? []).map(async (c) => {
            const match = existingDebtComponents.find(ec => ec.name === c);

            if (match) {
              return match;
            }

            const componentDetails = components.find(({ name }) => name === c);

            if (componentDetails) {
              return await this.debtService.createDebtComponent({
                name: c,
                amount: componentDetails.amount,
                debtCenterId: debtCenter.id,
                description: c,
              });
            }

            return Promise.reject({
              result: 'error',
              soft: true,
              code: 'NO_COMPONENT',
              message: `Component "${c}" present on a debt but not defined.`,
            });
          }));

          if (details.amount) {
            const existingBasePrice = existingDebtComponents.find((dc) => {
              return dc.name === 'Base Price' && dc.amount.value === details.amount?.value && dc.amount.currency === details.amount?.currency;
            });

            if (existingBasePrice) {
              debtComponents.push(existingBasePrice);
            } else {
              debtComponents.push(await this.debtService.createDebtComponent({
                name: 'Base Price',
                amount: details.amount,
                debtCenterId: debtCenter.id,
                description: 'Base Price',
              }));
            }
          }

          const options: CreateDebtOptions = {};

          if (details.paymentNumber || details.referenceNumber) {
            options.defaultPayment = {};

            if (details.paymentNumber) {
              options.defaultPayment.paymentNumber = details.paymentNumber;
            }

            if (details.referenceNumber) {
              options.defaultPayment.referenceNumber = details.referenceNumber;
            }
          }

          const newDebt: NewDebt = {
            centerId: debtCenter.id,
            accountingPeriod: details.accountingPeriod,
            description: details.description,
            name: details.title,
            payer: payer.id,
            dueDate,
            date,
            publishedAt,
            paymentCondition: paymentCondition ?? null,
            components: debtComponents.map(c => c.id),
            tags: (details.tags ?? []).map(name => ({ name, hidden: false })),
          };

          createdDebt = await this.debtService.createDebt(newDebt, options);
        } else {
          createdDebt = {
            id: '',
            humanId: '',
            payerId: payer?.id ?? internalIdentity(''),
            date: null,
            name: details.title,
            description: details.description,
            draft: true,
            publishedAt: null,
            debtCenterId: debtCenter.id,
            status: 'unpaid',
            lastReminded: null,
            dueDate: dueDate ? parseISO(dueDate) : null,
            paymentCondition: paymentCondition ?? null,
            defaultPayment: null,
            accountingPeriod: details.accountingPeriod,
            createdAt: new Date(),
            updatedAt: new Date(),
            debtComponents,
            credited: false,
            tags: (details.tags ?? []).map(name => ({ name, hidden: false })),
          };

          if (details.components && details.components.length > 0) {
            debtComponents = await Promise.all(details.components.map(async (c) => {
              const componentDetails = components.find(({ name }) => name === c);

              if (componentDetails) {
                return {
                  id: '',
                  name: c,
                  amount: componentDetails.amount,
                  description: '',
                  debtCenterId: debtCenter.id,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                } as DebtComponent;
              }

              const existing = await this.debtService.getDebtComponentsByCenter(debtCenter.id);
              const match = existing.find(ec => ec.name === c);

              if (match) {
                return match;
              }

              return Promise.reject({
                result: 'error',
                soft: true,
                code: 'NO_SUCH_COMPONENT',
                message: `Component "${c}" present on a debt but is no defined.`,
              });
            }));
          }

          if (details.amount) {
            debtComponents.push({
              id: '8d12e7ef-51db-465e-a5fa-b01cf01db5a8',
              name: 'Base Price',
              amount: details.amount,
              description: 'Base Price',
              debtCenterId: debtCenter.id,
              createdAt: new Date(),
              updatedAt: new Date(),
            });
          }
        }

        return {
          result: 'success',
          data: {
            payer,
            email,
            emailSource,
            debt: createdDebt,
            components: debtComponents,
            debtCenter,
          },
        };
      } catch (err) {
        return {
          result: 'error',
          soft: false,
          code: 'UNKNOWN',
          message: `Unknown error: ${err}`,
          stack: err instanceof Error ? err.stack : undefined,
        }
      }
    } else if (job.name === 'batch') {
      const values = await job.getChildrenValues<DebtJobResult>();

      const debts = [];

      for (const value of Object.values(values)) {
        if (value.result === 'error') {
          return value;
        } else {
          debts.push(value.data);
        }
      }

      return { result: 'success', data: { debts } };
    } else {
      return { result: 'error', soft: false, code: 'UNKNOWN_JOB_TYPE', message: `Unknown job type "${job.name}".` };
    }
  }

  async batchCreateDebts(debts: DebtCreationDetails[], components: { name: string, amount: EuroValue }[], token: string, dryRun: boolean) {
    return await this.jobService.createJob({
      queueName: 'debts',
      name: 'batch',
      data: { name: 'Create debts from CSV' },
      children: debts.map((details) => ({
        name: 'create',
        queueName: 'debts',
        data: {
          name: `Create debt for ${(details as any).name}`,
          details,
          token,
          dryRun,
          components,
        },
      })),
    });
  }

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
        (SELECT ARRAY_AGG(TO_JSONB(debt_tags.*)) FROM debt_tags WHERE debt_tags.debt_id = debt.id) AS tags
      FROM debt
      JOIN payer_profiles ON payer_profiles.id = debt.payer_id
      JOIN debt_center ON debt_center.id = debt.debt_center_id
      LEFT JOIN debt_component_mapping ON debt_component_mapping.debt_id = debt.id
      LEFT JOIN debt_component ON debt_component_mapping.debt_component_id = debt_component.id
    `;

    if (where) {
      query = query.append(' WHERE ').append(where).append(' ');
    }

    query = query.append(sql`GROUP BY debt.id, payer_profiles.*, debt_center.*`);

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
          INSERT INTO debt (
            name,
            description,
            debt_center_id,
            payer_id,
            due_date,
            created_at,
            payment_condition,
            published_at,
            date,
            accounting_period
          )
          VALUES (
            ${debt.name},
            ${debt.description},
            ${debt.centerId},
            ${payerProfile.id.value},
            ${debt.dueDate},
            COALESCE(${debt.createdAt}, NOW()),
            ${debt.paymentCondition},
            ${debt.publishedAt},
            ${debt.date},
            ${debt.accountingPeriod}
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

          first = false;
        }
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

    let handleTags: TE.TaskEither<Error, null> = async () => E.right(null);

    if (debt.tags) {
      const tags = debt.tags;

      const newTags = pipe(
        debt.tags,
        A.filter((name) => existingDebt.tags.findIndex(x => x.name === name) === -1),
      );

      const removedTags = pipe(
        existingDebt.tags,
        A.filter(({ name }) => tags.findIndex(x => x === name) === -1),
        A.map(t => t.name),
      );

      console.log(newTags, removedTags);

      const addTags =
        A.traverse(TE.ApplicativePar)((name) => async (): Promise<E.Either<Error, null>> => {
          await this.pg.one(sql`
            INSERT INTO debt_tags (debt_id, name, hidden) VALUES (${debt.id}, ${name}, false)
          `);

          return E.right(null);
        });

      const removeTags =
        A.traverse(TE.ApplicativePar)((name) => async (): Promise<E.Either<Error, null>> => {
          await this.pg.one(sql`DELETE FROM debt_tags WHERE debt_id = ${debt.id} AND name = ${name}`);

          return E.right(null);
        });

      handleTags = pipe(
        addTags(newTags),
        TE.chain(() => removeTags(removedTags)),
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
      TE.chainFirst(() => handleTags),
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
          (SELECT ARRAY_AGG(TO_JSONB(debt_tags.*)) FROM debt_tags WHERE debt_tags.debt_id = debt.id) AS tags
        FROM payment_debt_mappings pdm
        JOIN debt ON debt.id = pdm.debt_id
        JOIN payer_profiles ON payer_profiles.id = debt.payer_id
        JOIN debt_center ON debt_center.id = debt.debt_center_id
        LEFT JOIN debt_component_mapping ON debt_component_mapping.debt_id = debt.id
        LEFT JOIN debt_component ON debt_component_mapping.debt_component_id = debt_component.id
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
        (SELECT ARRAY_AGG(TO_JSONB(debt_tags.*)) FROM debt_tags WHERE debt_tags.debt_id = debt.id) AS tags
      FROM debt
      JOIN payer_profiles ON payer_profiles.id = debt.payer_id
      JOIN debt_center ON debt_center.id = debt.debt_center_id
      LEFT JOIN debt_component_mapping ON debt_component_mapping.debt_id = debt.id
      LEFT JOIN debt_component ON debt_component_mapping.debt_component_id = debt_component.id
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
    const payer = await this.payerService.getPayerProfileByInternalIdentity(debt.payerId);

    if (!email || !payer) {
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
        receiverName: payer.name,
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

  async sendAllReminders(draft = true, ignoreReminderCooldown = false, _debts: null | Debt[] = null) {
    let debts = _debts;

    if (debts === null) {
      debts = ignoreReminderCooldown
        ? await this.getOverdueDebts()
        : await this.getDebtsPendingReminder();
    }

    const sendReminder = (debt: Debt) => T.map(E.map((e) => [e, debt] as [Email, Debt]))(() => this.sendReminder(debt, true));

    const result = await flow(
      A.traverse(T.ApplicativePar)(sendReminder),
      T.map(A.separate),
    )(debts)();

    await this.emailService.batchSendEmails(result.right.map(([email]) => email.id));

    return { right: [], left: [] };
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

  async generateDebtLedger(options: DebtLedgerOptions, generatedBy: InternalIdentity, parent?: string) {
    let criteria;

    if (options.includeDrafts === 'include') {
      criteria = sql`debt.date IS NULL OR debt.date BETWEEN ${options.startDate} AND ${options.endDate}`;
    } else if (options.includeDrafts === 'exclude') {
      criteria = sql`debt.published_at IS NOT NULL AND debt.date BETWEEN ${options.startDate} AND ${options.endDate}`;
    } else {
      criteria = sql`debt.published_at IS NULL AND debt.created_at BETWEEN ${options.startDate} AND ${options.endDate}`;
    }

    if (options.centers !== null) {
      console.log(options.centers);
      criteria = sql`(`.append(criteria).append(sql`) AND (debt.debt_center_id = ANY (${options.centers}))`);
      console.log(criteria.sql, criteria.values);
    }
    
    const debts = await this.queryDebts(criteria);
    let groups;

    if (options.groupBy) {
      let getGroupKey;
      let getGroupDetails;

      if (options.groupBy === 'center') {
        getGroupKey = (debt: Debt) => debt.debtCenterId;
        getGroupDetails = async (id: string) => {
          const center = await this.debtCentersService.getDebtCenter(id);
          const name = center?.name ?? 'Unknown debt center';
          const displayId = center?.humanId ?? '???';
          return { name, id: displayId };
        };
      } else {
        getGroupKey = (debt: Debt) => debt.payerId.value;
        getGroupDetails = async (id: string) => {
          const payer = await this.payerService.getPayerProfileByInternalIdentity(internalIdentity(id));
          const name = payer?.name ?? 'Unknown payer';
          const displayId = payer?.id?.value ?? '???';
          return { name, id: displayId };
        };
      }

      const createGroupUsing = (nameResolver: (id: string) => Promise<{ name: string, id: string }>) => ([key, debts]: [string, Debt[]]) => async () => {
        const { name, id } = await nameResolver(key);
        return { name, debts, id }; 
      };

      groups = await pipe(
        debts,
        groupBy(getGroupKey),
        toArray,
        A.traverse(T.ApplicativePar)(createGroupUsing(getGroupDetails)),
      )();
    } else {
      groups = [{ debts }];
    }

    let name = `Debt Ledger ${format(options.startDate, 'dd.MM.yyyy')} - ${format(options.endDate, 'dd.MM.yyyy')}`;

    const report = await this.reportService.createReport({
      name,
      template: 'debt-ledger',
      options,
      payload: { options, groups },
      parent,
      generatedBy,
    });

    return report;
  }

  async generateDebtStatusReport(options: Omit<DebtStatusReportOptions, 'date'> & { date: Date }, generatedBy: InternalIdentity, parent?: string) {
    type ResultRow = Debt & { status: 'paid' | 'open' | 'credited' };

    let statusFilter = sql``;

    if (options.includeOnly === 'paid') {
      statusFilter = sql` HAVING bool_or(ps.status = 'paid') `;
    } else if (options.includeOnly === 'credited') {
      statusFilter = sql` HAVING debt.credited `;
    } else if (options.includeOnly === 'open') {
      statusFilter = sql` HAVING NOT (bool_or(ps.status = 'paid') OR debt.credited) `;
    }

    const dbResults = await this.pg.many<DbDebt & ({ status: 'paid', paid_at: Date } | { status: 'open', paid_at: null }) & { payment_id: string }>(sql`
      WITH payment_agg AS (
        SELECT
          payment_id,
          SUM(amount) AS balance,
          (COUNT(*) FILTER (WHERE type = 'payment'::text)) > 0 AS has_payment_event,
          (COUNT(*) FILTER (WHERE type = 'canceled'::text)) > 0 AS has_cancel_event,
          MAX(time) AS updated_at
        FROM payment_events e
        WHERE time < ${options.date}
        GROUP BY payment_id
      ),
      payment_statuses AS (
        SELECT
          p.id AS payment_id,
          (
            SELECT time
            FROM payment_events e2
            WHERE e2.payment_id = p.id AND e2.type = 'payment' AND e2.time < ${options.date}
            ORDER BY e2.time DESC
            LIMIT 1
          ) AS paid_at, 
          CASE
              WHEN s.has_cancel_event THEN 'canceled'::payment_status
              WHEN (NOT s.has_payment_event) THEN 'unpaid'::payment_status
              WHEN (s.balance <> 0) THEN 'mispaid'::payment_status
              ELSE 'paid'::payment_status
          END AS status
        FROM payment_agg s
        LEFT JOIN payments p ON p.id = s.payment_id
        LEFT JOIN payment_debt_mappings pdm ON pdm.payment_id = p.id
        INNER JOIN debt d ON d.id = pdm.debt_id AND d.published_at IS NOT NULL AND d.date < ${options.date} 
        LEFT JOIN payer_profiles pp ON pp.id = d.payer_id
      )
      SELECT
        debt.*,
        TO_JSON(payer_profiles.*) AS payer,
        TO_JSON(debt_center.*) AS debt_center,
        ARRAY_AGG(TO_JSON(debt_component.*)) AS debt_components,
        (
          SELECT SUM(dc.amount) AS total
          FROM debt_component_mapping dcm
          JOIN debt_component dc ON dc.id = dcm.debt_component_id
          WHERE dcm.debt_id = debt.id
        ) AS total,
        (SELECT ARRAY_AGG(TO_JSONB(debt_tags.*)) FROM debt_tags WHERE debt_tags.debt_id = debt.id) AS tags,
        (CASE
          WHEN debt.credited THEN 'credited'
          WHEN bool_or(ps.status = 'paid') THEN 'paid'
          ELSE 'open'
        END) status,
        MIN(ps.paid_at) paid_at,
        (CASE
          WHEN bool_or(ps.status = 'paid') THEN (ARRAY_AGG(ps.payment_id ORDER BY ps.paid_at) FILTER (WHERE ps.status = 'paid'))[1]
        END) payment_id
      FROM debt
      LEFT JOIN payment_debt_mappings pdm ON pdm.debt_id = debt.id
      LEFT JOIN payment_statuses ps ON ps.payment_id = pdm.payment_id
      LEFT JOIN payer_profiles ON payer_profiles.id = debt.payer_id
      LEFT JOIN debt_center ON debt_center.id = debt.debt_center_id
      LEFT JOIN debt_component_mapping ON debt_component_mapping.debt_id = debt.id
      LEFT JOIN debt_component ON debt_component_mapping.debt_component_id = debt_component.id
      WHERE debt.published_at IS NOT NULL
    `
      .append(
        options.centers
          ? sql` AND debt_center.id = ANY (${options.centers})`
          : sql``
      )
      .append(sql` GROUP BY debt.id, payer_profiles.*, debt_center.*`)
      .append(statusFilter)
      .append(sql` ORDER BY MIN(ps.paid_at)`)
    );

    const results = await Promise.all(dbResults.map(async (row) => ([
      formatDebt(row),
      row.status,
      row.paid_at,
      row.payment_id ? await this.paymentService.getPayment(row.payment_id) : null,
    ] as [Debt, 'open' | 'paid', Date, Payment | null])));

    let groups;

    if (options.groupBy) {
      let getGroupKey: (debt: Debt) => string;
      let getGroupDetails;

      if (options.groupBy === 'center') {
        getGroupKey = (debt: Debt) => debt.debtCenterId;
        getGroupDetails = async (id: string) => {
          const center = await this.debtCentersService.getDebtCenter(id);
          const name = center?.name ?? 'Unknown debt center';
          const displayId = center?.humanId ?? '???';
          return { name, id: displayId };
        };
      } else {
        getGroupKey = (debt: Debt) => debt.payerId.value;
        getGroupDetails = async (id: string) => {
          const payer = await this.payerService.getPayerProfileByInternalIdentity(internalIdentity(id));
          const name = payer?.name ?? 'Unknown payer';
          const displayId = payer?.id?.value ?? '???';
          return { name, id: displayId };
        };
      }

      const createGroupUsing = (nameResolver: (id: string) => Promise<{ name: string, id: string }>) => ([key, debts]: [string, [Debt, 'open' | 'paid', Date | null, Payment | null][]]) => async () => {
        const { name, id } = await nameResolver(key);
        return { name, debts, id }; 
      };

      groups = await pipe(
        results,
        groupBy(([debt]) => getGroupKey(debt)),
        toArray,
        A.traverse(T.ApplicativePar)(createGroupUsing(getGroupDetails)),
      )();
    } else {
      groups = [{ debts: results }];
    }

    const name = `Debt Status Report (${format(options.date, 'dd.MM.yyyy')})`;

    const report = await this.reportService.createReport({
      name,
      template: 'debt-status-report',
      options,
      payload: { options, groups },
      scale: 0.7,
      parent,
      generatedBy,
    });

    return report;
  }
}
