import {
  euro,
  DbDebt,
  DbDebtComponent,
  DebtComponent,
  Debt,
  internalIdentity,
  PayerProfile,
  EuroValue,
  Email,
  isPaymentInvoice,
  Payment,
  DbDebtTag,
  tkoalyIdentity,
  emailIdentity,
  DateString,
  convertToDbDate,
  NewInvoice,
} from '@bbat/common/build/src/types';
import sql, { SQLStatement } from 'sql-template-strings';
import * as t from 'io-ts';
import routes from './api';
import reports from './reports';
import {
  cents,
  formatEuro,
  sumEuroValues,
} from '@bbat/common/build/src/currency';
import iface, * as defs from './definitions';
import * as payerService from '@/modules/payers/definitions';
import * as paymentService from '@/modules/payments/definitions';
import * as usersService from '@/modules/users/definitions';
import * as debtCentersService from '@/modules/debt-centers/definitions';
import * as E from 'fp-ts/lib/Either';
import * as TE from 'fp-ts/lib/TaskEither';
import * as A from 'fp-ts/lib/Array';
import * as AA from 'fp-ts/lib/ReadonlyArray';
import * as O from 'fp-ts/lib/Option';
import * as S from 'fp-ts/lib/string';
import * as T from 'fp-ts/lib/Task';
import * as EQ from 'fp-ts/lib/Eq';
import { flow, pipe } from 'fp-ts/lib/function';
import { format, isBefore, isPast, parseISO, subMonths } from 'date-fns';
import { Job } from 'bullmq';
import { validate } from 'uuid';
import { BusContext } from '@/app';
import { isAccountingPeriodOpen } from '../accounting/definitions';
import { createReport } from '../reports/definitions';
import {
  batchSendEmails,
  createEmail,
  getEmail,
  sendEmail,
} from '../email/definitions';
import { ExecutionContext } from '@/bus';
import { Connection } from '@/db/connection';
import { formatDebt, formatDebtComponent, queryDebts } from './query';
import { createModule } from '@/module';

export type CreateDebtOptions = {
  defaultPayment?: Partial<NewInvoice>;
};

export type DebtLedgerOptions = {
  startDate: Date;
  endDate: Date;
  includeDrafts: 'include' | 'exclude' | 'only-drafts';
  groupBy: null | 'center' | 'payer';
  centers: null | Array<string>;
};

type DebtCreationDetails = Partial<{
  tkoalyUserId: number;
  debtCenter: string;
  title: string;
  description: string;
  email: string;
  date: DateString;
  amount: EuroValue;
  dueDate: DateString;
  publishedAt: DateString;
  paymentCondition: number;
  components: string[];
  paymentNumber: string;
  referenceNumber: string;
  tags: string[];
  accountingPeriod: number;
}>;

type DebtJobResult =
  | { result: 'success'; data: any }
  | {
      result: 'error';
      soft: boolean;
      message: string;
      code: string;
      stack?: string;
    };

type DebtJobDefinition = {
  details: DebtCreationDetails;
  token: string;
  dryRun: boolean;
  components: {
    name: string;
    amount: EuroValue;
  }[];
};

export default createModule({
  name: 'debt',

  routes,

  async setup({ bus, jobs }) {
    reports(bus);

    const linkPaymentToDebt = async (
      pg: Connection,
      payment: string,
      debt: string,
    ) =>
      pg.do(sql`
      INSERT INTO payment_debt_mappings (payment_id, debt_id)
      VALUES (${payment}, ${debt})
    `);

    bus.provide(iface, {
      async getDebt(id, { pg }) {
        const {
          result: [debt],
        } = await queryDebts(pg, {
          where: sql`id = ${id}`,
        });

        return debt ? formatDebt(debt) : null;
      },

      async getDebtsByCenter({ centerId, cursor, sort, limit }, { pg }) {
        return queryDebts(pg, {
          where: sql`debt_center_id = ${centerId}`,
          cursor,
          limit,
          order: sort
            ? [[sort.column, sort.dir] as [string, 'asc' | 'desc']]
            : undefined,
          map: formatDebt,
        });
      },

      async getDebtsByPayment(paymentId, { pg }) {
        return pg
          .many<DbDebt>(
            sql`
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
          `,
          )
          .then(dbDebts => dbDebts && dbDebts.map(formatDebt));
      },
      async onDebtPaid({ debt, payment }, _, bus) {
        const payments = await bus.exec(
          paymentService.getPaymentsContainingDebt,
          debt.id,
        );

        const promises = payments
          .filter(p => p.id !== payment.id)
          .map(async payment => {
            if (payment.type === 'invoice') {
              await bus.exec(paymentService.creditPayment, {
                id: payment.id,
                reason: 'paid',
              });
            }
          });

        await Promise.all(promises);
      },

      async getDebtComponentsByCenter(id, { pg }) {
        const components = await pg.many<DbDebtComponent>(sql`
          SELECT * FROM debt_component WHERE debt_center_id = ${id}
        `);

        return components.map(formatDebtComponent);
      },

      async generateDebtStatusReport({ options, generatedBy, parent }, _, bus) {
        const name = `Debt Status Report (${format(
          options.date,
          'dd.MM.yyyy',
        )})`;

        const report = await bus.exec(createReport, {
          name,
          template: 'debt-status-report',
          options,
          parent: parent ?? undefined,
          generatedBy,
        });

        return report;
      },

      async generateDebtLedger({ options, generatedBy, parent }, _, bus) {
        const name = `Debt Ledger ${format(
          options.startDate,
          'dd.MM.yyyy',
        )} - ${format(options.endDate, 'dd.MM.yyyy')}`;

        const report = await bus.exec(createReport, {
          name,
          template: 'debt-ledger',
          options,
          parent: parent ?? undefined,
          generatedBy,
        });

        return report;
      },
      async createDebtComponent(debtComponent, { pg }) {
        return pg
          .one<DbDebtComponent>(
            sql`
            INSERT INTO debt_component (name, amount, debt_center_id)
            VALUES (${debtComponent.name}, ${debtComponent.amount.value}, ${debtComponent.debtCenterId})
            RETURNING *
          `,
          )
          .then(dbDebtComponent => {
            if (!dbDebtComponent) {
              throw new Error(
                'Expected value to be returned from the database',
              );
            }

            return formatDebtComponent(dbDebtComponent);
          });
      },
      async deleteDebtComponent({ debtComponentId, debtCenterId }, { pg }) {
        // eslint-disable-next-line
        const { exists } = (await pg.one<{ exists: boolean }>(sql`
          SELECT
            EXISTS(
              SELECT *
              FROM debt_component
              WHERE id = ${debtComponentId} AND
                    debt_center_id = ${debtCenterId}
            ) AS exists
        `))!;

        if (!exists) {
          return E.left(new Error('No such debt component'));
        }

        const result = await pg.many<{ debt_id: string }>(sql`
          DELETE FROM debt_component_mapping
          WHERE debt_component_id = ${debtComponentId}
          RETURNING debt_id 
        `);

        await pg.do(sql`
          DELETE FROM debt_component
          WHERE id = ${debtComponentId} AND debt_center_id = ${debtCenterId}
        `);

        return E.right({
          affectedDebts: result.map(r => r.debt_id),
        });
      },

      async createDebt(
        { debt, options },
        { pg },
        bus,
      ): Promise<{
        id: string;
        humanId: string;
        accountingPeriod: number;
        name: string;
        tags: { name: string; hidden: boolean }[];
        date: Date | null;
        lastReminded: Date | null;
        dueDate: Date | null;
        draft: boolean;
        publishedAt: Date | null;
        payerId: { type: 'internal'; value: string };
        debtCenterId: string;
        description: string;
        createdAt: Date;
        updatedAt: Date;
        status: 'paid' | 'unpaid' | 'mispaid';
        paymentCondition: number | null;
        defaultPayment: string | null;
        credited: boolean;
        total: { currency: 'eur'; value: number };
        debtComponents: {
          id: string;
          name: string;
          amount: { currency: 'eur'; value: number };
          description: string;
          debtCenterId: string;
          createdAt: Date | null;
          updatedAt: Date | null;
        }[];
      }> {
        const payerProfile = await bus.exec(
          payerService.getPayerProfileByIdentity,
          debt.payer,
        );

        if (!payerProfile) {
          throw new Error('No such payer: ' + debt.payer.value);
        }

        const created = await pg.one<DbDebt>(sql`
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

        if (!created) {
          throw new Error('Failed to create debt!');
        }

        const tags = (
          await Promise.all(
            debt.tags.map(tag =>
              pg.one<DbDebtTag>(sql`
                INSERT INTO debt_tags (debt_id, name, hidden) VALUES (${created.id}, ${tag.name}, ${tag.hidden}) RETURNING *;
              `),
            ),
          )
        ).flat();

        created.tags = pipe(tags, A.map(O.fromNullable), A.compact);

        if (created === null) {
          throw new Error('Could not create debt');
        }

        await Promise.all(
          debt.components.map(async component => {
            await pg.do(sql`
                  INSERT INTO debt_component_mapping (debt_id, debt_component_id)
                  VALUES (${created.id}, ${component})
              `);
          }),
        );

        if (options?.defaultPayment) {
          const payment = await bus.exec(defs.createPayment, {
            debts: [created.id],
            payment: {
              type: 'invoice',
              message: debt.description,
              title: debt.name,
            },
            options: {
              series: 1,
              date: debt.date ? parseISO(debt.date) : undefined,
              ...options.defaultPayment,
            },
          });

          /*const payment = await bus.exec(paymentService.createInvoice, {
            invoice: {
            },
            options: {
              sendNotification: false,
            },
          });*/

          await setDefaultPayment(pg, created.id, payment.id);
        }

        const createdDebt = await bus.exec(defs.getDebt, created.id);

        if (createdDebt === null) {
          throw new Error(
            'Could not fetch just created debt from the database!',
          );
        }

        return createdDebt;
      },

      async updateDebtComponent(
        { debtCenterId, debtComponentId, debtComponent: patch },
        { pg },
      ) {
        const updated = await pg.one<DbDebtComponent>(sql`
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
      },
      async getDebtsByPayer(
        { id, includeDrafts, includeCredited, cursor, sort, limit },
        { pg },
      ) {
        return queryDebts(pg, {
          where: sql`
            payer_id = ${id.value}
              AND (${includeDrafts} OR published_at IS NOT NULL)
              AND (${includeCredited} OR NOT credited)
          `,
          cursor,
          order: sort
            ? [[sort.column, sort.dir] as [string, 'asc' | 'desc']]
            : undefined,
          limit,
          map: formatDebt,
        });
      },

      async createPayment({ debts: ids, payment, options }, { pg }, bus) {
        const result = await pipe(
          ids,
          A.traverse(T.ApplicativePar)(bus.execT(defs.getDebt)),
          T.map(
            flow(
              A.map(E.fromNullable(new Error('Debt not found'))),
              E.traverseArray(a => a),
            ),
          ),
          TE.bindTo('debts'),
          TE.let(
            'total',
            flow(
              t => t.debts,
              AA.map(d => d.total),
              AA.reduce(euro(0), sumEuroValues),
            ),
          ),
          TE.bind(
            'payment',
            flow(
              ({ total }) => ({
                payment: {
                  ...payment,
                  data: {},
                  amount: total,
                },
                defer: true,
                options,
              }),
              bus.execT(paymentService.createPayment),
              T.map(E.fromNullable(new Error('Failed to create payment!'))),
            ),
          ),
          TE.chainFirstTaskK(({ payment, debts }) =>
            pipe(
              debts,
              AA.traverse(T.ApplicativePar)(
                debt => () => linkPaymentToDebt(pg, payment.id, debt.id),
              ),
            ),
          ),
          TE.chainFirstTaskK(
            flow(o => o.payment.id, bus.execT(paymentService.finalizePayment)),
          ),
          TE.chainW(
            flow(
              o => o.payment.id,
              bus.execT(paymentService.getPayment),
              T.map(
                E.fromNullable(
                  new Error('Failed to fetch newly created payment!'),
                ),
              ),
            ),
          ),
        )();

        if (E.isLeft(result)) {
          throw result.left;
        }

        return result.right;
      },
    });

    /*const jobQueue: Queue<DebtJobDefinition, DebtJobResult, DebtJobName> =
      jobs.getQueue('debts');*/

    bus.on(
      paymentService.onStatusChanged,
      async ({ status, paymentId }, _, bus) => {
        if (status !== 'paid') {
          return;
        }

        const payment = await bus.exec(paymentService.getPayment, paymentId);
        const debts = await bus.exec(defs.getDebtsByPayment, paymentId);

        if (!payment) {
          return;
        }

        await Promise.all(
          debts.map(debt => bus.exec(defs.onDebtPaid, { debt, payment })),
        );
      },
    );

    async function resolvePayer(
      bus: ExecutionContext<BusContext>,
      {
        email,
        name,
        tkoalyUserId,
      }: { email?: string; name?: string; tkoalyUserId?: number },
      token: string,
      dryRun: boolean,
    ): Promise<PayerProfile | null> {
      if (tkoalyUserId) {
        const payer = await bus.exec(
          payerService.getPayerProfileByTkoalyIdentity,
          tkoalyIdentity(tkoalyUserId),
        );

        if (payer) {
          return payer;
        }
      }

      if (email) {
        const payer = await bus.exec(
          payerService.getPayerProfileByEmailIdentity,
          emailIdentity(email),
        );

        if (payer) {
          return payer;
        }

        const user = await bus.exec(usersService.getUpstreamUserByEmail, {
          email,
          token,
        });

        if (user) {
          if (dryRun) {
            return {
              id: internalIdentity(''),
              emails: [],
              name: user.screenName,
              tkoalyUserId: user.id,
              createdAt: new Date(),
              updatedAt: new Date(),
              disabled: false,
              mergedTo: null,
              paidCount: null,
              unpaidCount: null,
              total: null,
              debtCount: null,
              totalPaid: null,
              primaryEmail: null,
              paidRatio: 0,
            };
          } else {
            return await bus.exec(
              payerService.createPayerProfileFromTkoalyIdentity,
              {
                id: user.id,
                token,
              },
            );
          }
        }

        if (name) {
          if (dryRun) {
            return {
              id: internalIdentity(''),
              tkoalyUserId: null,
              total: null,
              name,
              createdAt: new Date(),
              updatedAt: new Date(),
              emails: [],
              disabled: false,
              paidCount: null,
              debtCount: null,
              totalPaid: null,
              unpaidCount: null,
              mergedTo: null,
              primaryEmail: null,
              paidRatio: 0,
            };
          } else {
            const payer = await bus.exec(
              payerService.createPayerProfileFromEmailIdentity,
              {
                id: emailIdentity(email),
                name,
              },
            );

            return payer;
          }
        }
      }

      return null;
    }

    async function resolveDebtCenter(
      bus: ExecutionContext<BusContext>,
      debtCenter: string,
      dryRun: boolean,
      accountingPeriod: number,
    ) {
      if (validate(debtCenter)) {
        const byId = await bus.exec(
          debtCentersService.getDebtCenter,
          debtCenter,
        );
        return byId;
      }

      const byName = await bus.exec(
        debtCentersService.getDebtCenterByName,
        debtCenter,
      );

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
        return await bus.exec(debtCentersService.createDebtCenter, {
          name: debtCenter,
          accountingPeriod,
          description: '',
          url: '',
        });
      }
    }

    async function handleDebtJob(
      bus: ExecutionContext<BusContext>,
      job: Job<DebtJobDefinition, DebtJobResult, string>,
    ): Promise<DebtJobResult> {
      if (job.name === 'create') {
        await new Promise(resolve => setTimeout(resolve, 100));

        const missingField = (
          field: string,
        ): DebtJobResult & { result: 'error' } => ({
          result: 'error',
          soft: true,
          code: 'MISSING_FIELD',
          message: `Required field "${field}" not specified.`,
        });

        try {
          const { details, token, components, dryRun } = job.data;

          const payer = await resolvePayer(bus, details, token, dryRun);

          if (!payer && !details.email) {
            return {
              result: 'error',
              soft: true,
              code: 'NO_PAYER_OR_EXPLICIT_EMAIL',
              message:
                'Cannot create debt without sufficient payer information.',
            };
          }

          let email = details.email;
          let emailSource = 'explicit';

          if (!email && payer) {
            const primary = await bus.exec(
              payerService.getPayerPrimaryEmail,
              payer.id,
            );

            if (!primary) {
              return {
                result: 'error',
                soft: true,
                code: 'PAYER_HAS_NO_EMAIL',
                message: 'Could not resolve an email address for the payer.',
              };
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

          const accountingPeriodOpen = await bus.exec(
            isAccountingPeriodOpen,
            details.accountingPeriod,
          );

          if (!accountingPeriodOpen) {
            return {
              result: 'error',
              soft: true,
              code: 'ACCOUNTING_PERIOD_CLOSED',
              message: `The specified accounting period (${details.accountingPeriod}) is not open.`,
            };
          }

          const debtCenter = await resolveDebtCenter(
            bus,
            details.debtCenter,
            dryRun,
            details.accountingPeriod,
          );

          if (!debtCenter) {
            return {
              result: 'error',
              soft: true,
              code: 'COULD_NOT_RESOLVE_DEBT_CENTER',
              message: 'Could not resolve debt center for the debt.',
            };
          }

          let dueDate = null;

          if (details.dueDate) {
            dueDate = convertToDbDate(details.dueDate);

            if (!dueDate) {
              return {
                result: 'error',
                soft: true,
                code: 'INVALID_VALUE',
                message: 'Invalid value provided for the field "dueDate".',
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
                message: 'Invalid value provided for the field "date".',
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
                message: 'Invalid value provided for the field "publishedAt".',
              };
            }
          }

          let paymentCondition = details.paymentCondition;

          if (dueDate && paymentCondition) {
            return {
              result: 'error',
              soft: true,
              code: 'BOTH_DUE_DATE_AND_CONDITION',
              message:
                'Both a due date and a payment condition were specified for the same debt.',
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
                message: 'No payer could be resolved for the debt.',
              };
            }

            const existingDebtComponents = await bus.exec(
              defs.getDebtComponentsByCenter,
              debtCenter.id,
            );

            debtComponents = await Promise.all(
              (details?.components ?? []).map(async c => {
                const match = existingDebtComponents.find(ec => ec.name === c);

                if (match) {
                  return match;
                }

                const componentDetails = components.find(
                  ({ name }) => name === c,
                );

                if (componentDetails) {
                  return await bus.exec(defs.createDebtComponent, {
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
              }),
            );

            if (details.amount) {
              const existingBasePrice = existingDebtComponents.find(dc => {
                return (
                  dc.name === 'Base Price' &&
                  dc.amount.value === details.amount?.value &&
                  dc.amount.currency === details.amount?.currency
                );
              });

              if (existingBasePrice) {
                debtComponents.push(existingBasePrice);
              } else {
                debtComponents.push(
                  await bus.exec(defs.createDebtComponent, {
                    name: 'Base Price',
                    amount: details.amount,
                    debtCenterId: debtCenter.id,
                    description: 'Base Price',
                  }),
                );
              }
            }

            const options: CreateDebtOptions = {};

            if (details.paymentNumber || details.referenceNumber) {
              options.defaultPayment = {};

              if (details.paymentNumber) {
                options.defaultPayment.paymentNumber = details.paymentNumber;
              }

              if (details.referenceNumber) {
                options.defaultPayment.referenceNumber =
                  details.referenceNumber;
              }
            }

            const accountingPeriod = E.getOrElseW(() => null)(
              t.Int.decode(details.accountingPeriod),
            );

            if (!accountingPeriod) {
              throw new Error('Invalid accounting period!');
            }

            const newDebt = {
              centerId: debtCenter.id,
              accountingPeriod,
              description: details.description,
              name: details.title,
              payer: payer.id,
              dueDate,
              date: date ?? undefined,
              publishedAt: publishedAt ?? undefined,
              paymentCondition: paymentCondition ?? null,
              components: debtComponents.map(c => c.id),
              tags: (details.tags ?? []).map(name => ({ name, hidden: false })),
            };

            createdDebt = await bus.exec(defs.createDebt, {
              debt: newDebt,
              options,
            });
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
              total: debtComponents
                .map(c => c.amount)
                .reduce(sumEuroValues, cents(0)),
              createdAt: new Date(),
              updatedAt: new Date(),
              debtComponents,
              credited: false,
              tags: (details.tags ?? []).map(name => ({ name, hidden: false })),
            };

            if (details.components && details.components.length > 0) {
              debtComponents = await Promise.all(
                details.components.map(async c => {
                  const componentDetails = components.find(
                    ({ name }) => name === c,
                  );

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

                  const existing = await bus.exec(
                    defs.getDebtComponentsByCenter,
                    debtCenter.id,
                  );

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
                }),
              );
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
          };
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
        return {
          result: 'error',
          soft: false,
          code: 'UNKNOWN_JOB_TYPE',
          message: `Unknown job type "${job.name}".`,
        };
      }
    }

    bus.register(
      defs.batchCreateDebts,
      async ({ debts, components, token, dryRun }) => {
        const { job } = await jobs.createJob({
          queueName: 'debts',
          name: 'batch',
          data: { name: 'Create debts from CSV' },
          children: debts.map(details => ({
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

        if (job.id === undefined) {
          throw new Error('Created job has no id!');
        }

        return job.id;
      },
    );

    bus.register(defs.getDebtsByTag, async (tag, { pg }) => {
      const { result } = await queryDebts(pg, {
        where: sql`id = ANY (SELECT dt.debt_id FROM debt_tags dt WHERE dt.name = ${tag})`,
      });

      return result.map(formatDebt);
    });

    bus.register(defs.getDebts, async ({ cursor, sort, limit }, { pg }) => {
      return queryDebts(pg, {
        limit,
        cursor,
        order: sort
          ? [[sort.column, sort.dir] as [string, 'asc' | 'desc']]
          : undefined,
        map: formatDebt,
      });
    });

    async function createDefaultPaymentFor(
      pg: Connection,
      bus: ExecutionContext<BusContext>,
      debt: Debt,
    ): Promise<Payment> {
      const created = await bus.exec(defs.createPayment, {
        debts: [debt.id],
        payment: {
          type: 'invoice',
          title: debt.name,
          message: debt.description,
        },
        options: {
          date: debt.date ?? undefined,
        },
      });

      /*const created = await bus.exec(paymentService.createInvoice, {
        invoice: {
        },
        options: {
          sendNotification: false,
        },
      });*/

      await setDefaultPayment(pg, debt.id, created.id);

      if (!created) {
        return Promise.reject('Could not create invoice for debt');
      }

      return created;
    }

    bus.register(defs.publishDebt, async (debtId: string, { pg }, bus) => {
      const debt = await bus.exec(defs.getDebt, debtId);

      if (!debt) {
        throw new Error('No such debt');
      }

      await pg.do(sql`
        UPDATE debt
        SET
          published_at = NOW(),
          date = COALESCE(date, NOW()),
          due_date = COALESCE(due_date, NOW() + MAKE_INTERVAL(days => payment_condition))
        WHERE id = ${debtId}
      `);

      const defaultPayment = debt.defaultPayment
        ? await bus.exec(paymentService.getPayment, debt.defaultPayment)
        : await createDefaultPaymentFor(pg, bus, debt);

      if (!defaultPayment) {
        throw new Error('No default invoice exists for payment');
      }

      if (!isPaymentInvoice(defaultPayment)) {
        console.log('Not invoice: ', defaultPayment);

        throw new Error(
          `The default payment of debt ${debt.id} is not an invoice!`,
        );
      }

      /*
      const isBackdated = isBefore(
        parseISO(defaultPayment.data.date),
        subDays(new Date(), 1),
      );

      if (debt.status === 'unpaid' && !isBackdated) {
        const message = await bus.exec(
          paymentService.sendNewPaymentNotification,
          defaultPayment.id,
        );

        if (E.isLeft(message)) {
          throw new Error('Could not send invoice notification.');
        }

        await bus.exec(sendEmail, message.right.id);
      }*/
    });

    async function setDefaultPayment(
      pg: Connection,
      debtId: string,
      paymentId: string,
    ) {
      await pg.do(sql`
        UPDATE debt SET default_payment = ${paymentId} WHERE id = ${debtId}
      `);
    }

    bus.register(defs.updateDebt, async (debt, { pg }, bus) => {
      const existingDebt = await bus.exec(defs.getDebt, debt.id);

      if (!existingDebt) {
        return E.left(new Error('No such debt'));
      }

      if (debt.payerId) {
        const payer = await bus.exec(
          payerService.getPayerProfileByIdentity,
          debt.payerId,
        );

        if (!payer) {
          return E.left(new Error('No such payer'));
        }
      }

      const update = (
        table: string,
        condition: SQLStatement,
        values: Record<string, any>,
      ) => {
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

        query = query
          .append(' WHERE ')
          .append(condition)
          .append(' RETURNING *');

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

      let handleComponents: TE.TaskEither<Error, null> = async () =>
        E.right(null);

      if (debt.components) {
        const components = debt.components;

        const newComponents = pipe(
          debt.components,
          A.filter(
            id =>
              existingDebt.debtComponents.findIndex(x => x.id === id) === -1,
          ),
        );

        const removedComponents = pipe(
          existingDebt.debtComponents,
          A.filter(({ id }) => components.findIndex(x => x === id) === -1),
          A.map(c => c.id),
        );

        const addComponents = A.traverse(TE.ApplicativePar)(
          id => async (): Promise<E.Either<Error, null>> => {
            await pg.one(sql`
              INSERT INTO debt_component_mapping (debt_id, debt_component_id) VALUES (${debt.id}, ${id})
            `);

            return E.right(null);
          },
        );

        const removeComponents = A.traverse(TE.ApplicativePar)(
          id => async (): Promise<E.Either<Error, null>> => {
            await pg.one(
              sql`DELETE FROM debt_component_mapping WHERE debt_id = ${debt.id} AND debt_component_id = ${id}`,
            );

            return E.right(null);
          },
        );

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
          A.filter(
            name => existingDebt.tags.findIndex(x => x.name === name) === -1,
          ),
        );

        const removedTags = pipe(
          existingDebt.tags,
          A.filter(({ name }) => tags.findIndex(x => x === name) === -1),
          A.map(t => t.name),
        );

        console.log(newTags, removedTags);

        const addTags = A.traverse(TE.ApplicativePar)(
          name => async (): Promise<E.Either<Error, null>> => {
            await pg.one(sql`
              INSERT INTO debt_tags (debt_id, name, hidden) VALUES (${debt.id}, ${name}, false)
            `);

            return E.right(null);
          },
        );

        const removeTags = A.traverse(TE.ApplicativePar)(
          name => async (): Promise<E.Either<Error, null>> => {
            await pg.one(
              sql`DELETE FROM debt_tags WHERE debt_id = ${debt.id} AND name = ${name}`,
            );

            return E.right(null);
          },
        );

        handleTags = pipe(
          addTags(newTags),
          TE.chain(() => removeTags(removedTags)),
          TE.map(() => null),
        );
      }

      const result = await pipe(
        () => pg.one<DbDebt>(query),
        T.map(O.fromNullable),
        T.map(E.of),
        TE.chainEitherK(E.fromOption(() => new Error('No such debt'))),
        TE.map(debt => ({
          ...debt,
          tags: [],
        })),
        TE.map(formatDebt),
        TE.chainFirst(() => handleComponents),
        TE.chainFirst(() => handleTags),
        TE.map(debt => debt.id),
        TE.flatMapTask(bus.execT(defs.getDebt)),
        TE.chainEitherK(
          E.fromNullable(new Error('Failed to fetch updated debt!')),
        ),
      )();

      return result;
    });

    bus.register(defs.getDebtTotal, async (id, { pg }) => {
      const result = await pg.one<{ total: number }>(sql`
        SELECT SUM(dc.amount) AS total
        FROM debt_component_mapping dcm
        JOIN debt_component dc ON dc.id = dcm.debt_component_id
        WHERE dcm.debt_id = ${id}
      `);

      if (!result) {
        throw new Error('no such debt');
      }

      return cents(result.total);
    });

    bus.register(defs.deleteDebt, async (id: string, { pg }, bus) => {
      const debt = await bus.exec(defs.getDebt, id);

      if (!debt) {
        throw new Error('Debt not found');
      }

      if (!debt.draft) {
        throw new Error('Cannot delete published debts');
      }

      await pg.do(
        sql`DELETE FROM debt_component_mapping WHERE debt_id = ${id}`,
      );
      await pg.do(sql`DELETE FROM debt WHERE id = ${id}`);
    });

    bus.register(defs.creditDebt, async (id, { pg }, bus) => {
      const debt = await bus.exec(defs.getDebt, id);

      if (!debt) {
        throw new Error('Debt not found');
      }

      if (debt.draft) {
        throw new Error('Cannot credit unpublished debts');
      }

      await pg.do(sql`UPDATE debt SET credited = true WHERE id = ${id} `);
      await pg.do(
        sql`UPDATE payments SET credited = true WHERE id IN (SELECT payment_id FROM payment_debt_mappings WHERE debt_id = ${id})`,
      );
    });

    async function getOverdueDebts(pg: Connection) {
      const { result } = await queryDebts(pg, {
        where: sql`due_date < NOW() AND published_at IS NOT NULL AND NOT (SELECT is_paid FROM debt_statuses ds WHERE ds.id = debt.id)`,
      });

      return result.map(formatDebt);

      /*const debts = await pg.any<DbDebt>(sql`
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

      return debts.map(formatDebt);*/
    }

    async function getDebtsPendingReminder(pg: Connection) {
      const debts = await pg.many<DbDebt>(sql`
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

    async function setDebtLastReminded(
      pg: Connection,
      id: string,
      lastReminded: Date,
    ) {
      await pg.do(sql`
        UPDATE debt SET last_reminded = ${lastReminded} WHERE id = ${id}
      `);
    }

    bus.register(
      defs.sendReminder,
      async ({ debtId, draft = true }, { pg }, bus) => {
        const debt = await bus.exec(defs.getDebt, debtId);

        if (debt == null) {
          return E.left('Debt not found');
        }

        if (debt.draft) {
          return E.left('Debt is a draft');
        }

        const email = await bus.exec(
          payerService.getPayerPrimaryEmail,
          debt.payerId,
        );
        const payer = await bus.exec(
          payerService.getPayerProfileByInternalIdentity,
          debt.payerId,
        );

        if (!email || !payer) {
          return E.left('No primary email for payer');
        }

        const payment = await bus.exec(
          paymentService.getDefaultInvoicePaymentForDebt,
          debt.id,
        );

        if (!payment || !isPaymentInvoice(payment)) {
          return E.left('No default invoice found for debt');
        }

        const dueDate = debt.dueDate ? new Date(debt.dueDate) : null;

        if (dueDate === null || !isPast(dueDate)) {
          return E.left('Debt not due yet');
        }

        const createdEmail = await bus.exec(createEmail, {
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
          debts: [debt.id],
        });

        if (!createdEmail) {
          return E.left('Could not create email');
        }

        if (!draft) {
          await bus.exec(sendEmail, createdEmail.id);
          const refreshed = await bus.exec(getEmail, createdEmail.id);

          return E.fromNullable('Could not fetch new email details')(refreshed);
        }

        await setDebtLastReminded(pg, debt.id, createdEmail.createdAt);

        return E.right(createdEmail);
      },
    );

    bus.register(
      defs.sendAllReminders,
      async (
        { draft = true, ignoreReminderCooldown = false, debts: pDebts },
        { pg },
        bus,
      ) => {
        let debts: string[];

        if (!pDebts) {
          debts = (
            ignoreReminderCooldown
              ? await getOverdueDebts(pg)
              : await getDebtsPendingReminder(pg)
          ).map(d => d.id);
        } else {
          debts = pDebts;
        }

        const result = await flow(
          A.traverse(T.ApplicativePar)((debtId: string) =>
            pipe(
              { debtId, draft: true },
              bus.execT(defs.sendReminder),
              TE.map(email => ({ debtId, email })),
            ),
          ),
          T.map(A.separate),
        )(debts)();

        if (!draft) {
          await bus.exec(
            batchSendEmails,
            result.right.map(({ email }) => email.id),
          );
        }

        return result;
      },
    );

    bus.register(defs.getDebtsByEmail, async (emailId, { pg }) => {
      const { result: debts } = await queryDebts(pg, {
        where: sql`id IN (SELECT debt_id FROM email_debt_mapping WHERE email_id = ${emailId})`,
        map: formatDebt,
      });

      return debts;
    });

    bus.register(
      defs.sendPaymentRemindersByPayer,
      async ({ payer, send, ignoreCooldown }, _, bus) => {
        const { result: debts } = await bus.exec(defs.getDebtsByPayer, {
          id: payer,
          includeCredited: false,
          includeDrafts: false,
        });

        const email = await bus.exec(payerService.getPayerPrimaryEmail, payer);

        if (!email) {
          throw new Error(
            'No such user or no primary email for user ' + payer.value,
          );
        }

        const overdue = debts.filter(
          debt =>
            !!debt.publishedAt &&
            debt.status != 'paid' &&
            debt.dueDate &&
            isPast(debt.dueDate) &&
            (ignoreCooldown ||
              !debt.lastReminded ||
              isBefore(debt.lastReminded, subMonths(new Date(), 1))),
        );

        const getEmailPayerId = ([, debt]: [Email, Debt]) => debt.payerId.value;
        const EmailPayerEq = EQ.contramap(getEmailPayerId)(S.Eq);
        const _sendReminder = (debt: Debt) =>
          pipe(
            bus.execT(defs.sendReminder)({ debtId: debt.id, draft: !send }),
            TE.map(e => [e, debt] as [Email, Debt]),
          );

        return pipe(
          overdue,
          A.traverse(T.ApplicativePar)(_sendReminder),
          T.map(A.separate),
          T.map(({ left, right }) => ({
            messageCount: right.length,
            payerCount: A.uniq(EmailPayerEq)(right).length,
            errors: left,
          })),
        )();
      },
    );

    bus.register(
      defs.createCombinedPayment,
      async ({ debts: debtIds, type, options }, _, bus) => {
        const debts = await pipe(
          debtIds,
          A.traverse(T.ApplicativePar)(bus.execT(defs.getDebt)),
          T.map(flow(A.map(O.fromNullable), A.compact)),
        )();

        return bus.exec(defs.createPayment, {
          debts: debtIds,
          options: {
            ...options,
            series: 9,
          },
          payment: {
            type,
            title: 'Combined invoice',
            message:
              'Invoice for the following debts:\n' +
              debts
                .map(
                  d =>
                    ` - ${d.name} (${formatEuro(
                      d.debtComponents
                        .map(dc => dc.amount)
                        .reduce(sumEuroValues, euro(0)),
                    )})`,
                )
                .join('\n'),
          },
        });
      },
    );

    await jobs.createWorker('debts', handleDebtJob);
  },
});
