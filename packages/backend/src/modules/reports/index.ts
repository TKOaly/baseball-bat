import * as t from 'io-ts';
import * as puppeteer from 'puppeteer';
import { Browser } from 'puppeteer';
import { sql } from '@/db/template';
import routes from './api';
import * as path from 'path';
import * as paymentService from '@/modules/payments/definitions';
import * as fs from 'fs';
import * as uuid from 'uuid';
import {
  DbReport,
  InternalIdentity,
  internalIdentity,
  Report,
} from '@bbat/common/build/src/types';
import ejs from 'ejs';
import {
  cents,
  euro,
  formatEuro,
  subEuroValues,
  sumEuroValues,
} from '@bbat/common/build/src/currency';
import * as datefns from 'date-fns';
import { isRight } from 'fp-ts/Either';
import {
  generateDebtLedger,
  generateDebtStatusReport,
} from '@/modules/debts/definitions';
import * as defs from './definitions';
import * as jobs from '@/modules/jobs/definitions';
import { Connection } from '@/db/connection';
import { createModule } from '@/module';

export type CreateReportOptions = {
  template: string;
  name: string;
  payload: unknown;
  options: unknown;
  scale?: number;
  parent?: string;
  generatedBy: InternalIdentity;
};

export type SaveReportOptions = {
  generatedAt?: Date;
  name: string;
  options: unknown;
  type: string;
  parent?: string;
  generatedBy: InternalIdentity;
};

const formatReport = (
  db: Omit<DbReport, 'history'>,
): Omit<Report, 'history'> => ({
  id: db.id,
  name: db.name,
  generatedAt:
    typeof db.generated_at === 'string'
      ? datefns.parseISO(db.generated_at)
      : db.generated_at,
  humanId: db.human_id,
  options: db.options,
  type: db.type,
  revision: db.revision,
  status: db.status,
  generatedBy: db.generated_by ? internalIdentity(db.generated_by) : null,
});

const formatReportWithHistory = (db: DbReport): Report => ({
  ...formatReport(db),
  history: db.history.map(formatReport),
});

export default createModule({
  name: 'reports',

  routes,

  async setup({ config, bus, minio }) {
    let _browser: Browser | null = null;

    async function getBrowser() {
      if (_browser === null) {
        _browser = await puppeteer.launch({
          executablePath: config.chromiumBinaryPath ?? undefined,
          headless: true,
          args: ['--no-sandbox'],
        });
      }

      return _browser;
    }

    async function render(source: string, scale = 0.8) {
      const browser = await getBrowser();
      const page = await browser.newPage();

      await page.setContent(source, {
        waitUntil: ['domcontentloaded', 'load', 'networkidle0'],
      });

      await new Promise(resolve => setTimeout(resolve, 10000));

      await page.addStyleTag({
        content: `
          html {
            -webkit-print-color-adjust: exact;
          }
        `,
      });

      const pdf = await page.pdf({
        format: 'A4',
        scale,
        landscape: true,
      });

      await page.close();
      await browser.close();
      _browser = null;

      return pdf;
    }

    async function loadTemplate(name: string): Promise<string> {
      const templateBasePath = path.join(
        config.assetPath,
        'templates',
        'reports',
      );
      const templatePath = path.join(templateBasePath, `${name}.ejs`);
      const content = await fs.promises.readFile(templatePath, 'utf8');
      return content;
    }

    async function reserveReport(
      pg: Connection,
      options: SaveReportOptions,
    ): Promise<Omit<Report, 'history'> | null> {
      const id = uuid.v4();

      const revision = options.parent
        ? sql`(SELECT revision + 1 FROM reports WHERE id = ${options.parent})`
        : sql`DEFAULT`;

      const nonce = options.parent
        ? sql`(SELECT human_id_nonce FROM reports WHERE id = ${options.parent})`
        : sql`DEFAULT`;

      const report = await pg.one<Omit<DbReport, 'history'>>(
        sql`
        INSERT INTO reports (id, name, generated_at, options, type, generated_by, revision, human_id_nonce)
        VALUES (
          ${id},
          ${options.name},
          COALESCE(${options.generatedAt}, NOW()),
          ${options.options},
          ${options.type},
          ${options.generatedBy.value},
          ${revision},
          ${nonce}
        )
        RETURNING *;
      `,
      );

      if (report && options.parent) {
        await pg.do(
          sql`UPDATE reports SET superseded_by = ${report.id} WHERE id = ${options.parent}`,
        );
      }

      return report && formatReport(report);
    }

    async function updateReportStatus(
      pg: Connection,
      id: string,
      status: 'finished' | 'failed',
    ): Promise<Omit<Report, 'history'> | null> {
      const report = await pg.one<Omit<DbReport, 'history'>>(sql`
        UPDATE reports
        SET status = ${status}
        WHERE id = ${id}
        RETURNING *
      `);

      return report && formatReport(report);
    }

    async function saveReport(id: string, content: Buffer) {
      const metadata = {
        'Content-Type': 'application/pdf',
      };

      await minio.putObject(
        config.minioBucket,
        `reports/${id}`,
        content,
        metadata,
      );
    }

    bus.register(defs.createReport, async (options, { pg, session }, ctx) => {
      if (session?.authLevel !== 'authenticated') {
        throw new Error('Unauthenticated!');
      }

      const generatedAt = new Date();

      const report = await reserveReport(pg, {
        generatedAt,
        name: options.name,
        options: options.options,
        type: options.template,
        parent: options.parent,
        generatedBy: session.payerId,
      });

      if (!report) {
        throw new Error('Failed to create report!');
      }

      await ctx.exec(jobs.create, {
        type: 'create-report',
        data: {
          id: report.id,
        },
        title: `Create report "${report.name}"`,
        retries: 0,
        concurrencyLimit: 2,
      });

      return report;
    });

    bus.register(defs.getReport, async (id, { pg }) => {
      const report = await pg.one<DbReport>(sql`
        WITH RECURSIVE report_history AS (
          SELECT reports.id, generated_by, status, revision, name, generated_at, human_id, options, type, superseded_by, cast(NULL as UUID) as head FROM reports WHERE id = ${id}
          UNION
          SELECT r.id, r.generated_by, r.status, r.revision, r.name, r.generated_at, r.human_id, r.options, r.type, r.superseded_by, COALESCE(h.head, h.id) FROM reports r, report_history h WHERE r.superseded_by = h.id
        ),
        step AS (
          SELECT COALESCE(head, id) head, ARRAY_AGG(id) FILTER (WHERE id <> head) history FROM report_history
          GROUP BY COALESCE(head, id)
        )
        SELECT r.*, ARRAY_REMOVE(ARRAY_AGG(TO_JSONB(r2.*)), NULL) history
        FROM reports r, step s
        LEFT JOIN reports r2 ON r2.id = ANY (s.history)
        WHERE r.superseded_by IS NULL AND s.head = r.id
        GROUP BY r.id
      `);

      return report && formatReportWithHistory(report);
    });

    bus.register(defs.getReportUrl, async id => {
      const url = new URL(
        await minio.presignedGetObject(
          config.minioBucket,
          `reports/${id}`,
          5 * 60,
        ),
      );

      if (config.minioPublicUrl !== config.minioUrl) {
        const publicUrl = new URL(config.minioPublicUrl);

        url.host = publicUrl.host;
        url.protocol = publicUrl.protocol;
        url.port = publicUrl.port;
      }

      return url.toString();
    });

    bus.register(defs.getReports, async (_, { pg }) => {
      const reports = await pg.many<DbReport>(sql`
        WITH RECURSIVE report_history AS (
          SELECT reports.id, generated_by, status, revision, name, generated_at, human_id, options, type, superseded_by, cast(NULL as UUID) as head FROM reports WHERE superseded_by IS NULL
          UNION
          SELECT r.id, r.generated_by, r.status, r.revision, r.name, r.generated_at, r.human_id, r.options, r.type, r.superseded_by, COALESCE(h.head, h.id) FROM reports r, report_history h WHERE r.superseded_by = h.id
        ),
        step AS (
          SELECT COALESCE(head, id) head, ARRAY_AGG(id) FILTER (WHERE id <> head) history FROM report_history
          GROUP BY COALESCE(head, id)
        )
        SELECT r.*, ARRAY_REMOVE(ARRAY_AGG(TO_JSONB(r2.*)), NULL) history
        FROM reports r, step s
        LEFT JOIN reports r2 ON r2.id = ANY (s.history)
        WHERE r.superseded_by IS NULL AND s.head = r.id
        GROUP BY r.id
      `);

      return reports.map(formatReportWithHistory);
    });

    bus.register(defs.refreshReport, async ({ reportId }, _, bus) => {
      const report = await bus.exec(defs.getReport, reportId);

      if (!report) {
        throw new Error('No such report.');
      }

      if (report.type === 'debt-ledger') {
        const optionsType = t.type({
          startDate: t.string,
          endDate: t.string,
          includeDrafts: t.union([
            t.literal('include'),
            t.literal('exclude'),
            t.literal('only-drafts'),
          ]),
          groupBy: t.union([t.null, t.literal('payer'), t.literal('center')]),
          centers: t.union([t.null, t.array(t.string)]),
        });

        const result = optionsType.decode(report.options);

        if (isRight(result)) {
          const options = result.right;

          return await bus.exec(generateDebtLedger, {
            options: {
              startDate: new Date(options.startDate),
              endDate: new Date(options.endDate),
              centers: options.centers,
              groupBy: options.groupBy,
              includeDrafts: options.includeDrafts,
            },
            parent: report.id,
          });
        } else {
          throw new Error('Invalid report options!');
        }
      } else if (report.type === 'payment-ledger') {
        const optionsType = t.type({
          startDate: t.string,
          endDate: t.string,
          paymentType: t.union([
            t.null,
            t.literal('cash'),
            t.literal('invoice'),
            t.literal('stripe'),
          ]),
          centers: t.union([t.null, t.array(t.string)]),
          groupBy: t.union([t.null, t.literal('payer'), t.literal('center')]),
          eventTypes: t.union([
            t.null,
            t.array(
              t.union([
                t.literal('payment'),
                t.literal('created'),
                t.literal('credited'),
              ]),
            ),
          ]),
        });

        const result = optionsType.decode(report.options);

        if (isRight(result)) {
          const options = result.right;

          return await bus.exec(paymentService.generatePaymentLedger, {
            options: {
              startDate: new Date(options.startDate),
              endDate: new Date(options.endDate),
              centers: options.centers,
              groupBy: options.groupBy,
              eventTypes: options.eventTypes,
              paymentType: options.paymentType,
            },
            parent: report.id,
          });
        } else {
          throw new Error('Invalid report options.');
        }
      } else if (report.type === 'debt-status-report') {
        const optionsType = t.intersection([
          t.type({
            date: t.string,
            groupBy: t.union([t.null, t.literal('payer'), t.literal('center')]),
            centers: t.union([t.null, t.array(t.string)]),
          }),
          t.partial({
            includeOnly: t.union([
              t.null,
              t.literal('open'),
              t.literal('paid'),
              t.literal('credited'),
            ]),
          }),
        ]);

        const result = optionsType.decode(report.options);

        if (isRight(result)) {
          const options = result.right;

          return await bus.exec(generateDebtStatusReport, {
            options: {
              date: new Date(options.date),
              centers: options.centers,
              groupBy: options.groupBy,
              includeOnly: options.includeOnly ?? null,
            },
            parent: report.id,
          });
        } else {
          throw new Error('Failed to refresh debt status report!');
        }
      } else {
        throw new Error(`Unkown report type '${report.type}'.`);
      }
    });

    type ReportJob = {
      id: string;
    };

    bus.provideNamed(jobs.executor, 'create-report', {
      async execute(job, _, ctx) {
        const { id } = job.data as ReportJob;

        const report = await ctx.exec(defs.getReport, id);

        if (!report) {
          throw new Error('Report does not exist!');
        }

        if (report.status === 'finished') {
          return;
        }

        if (!report.type) {
          throw new Error('Report has undefined type!');
        }

        try {
          const reportType = ctx.getInterface(
            defs.reportTypeIface,
            report.type,
          );
          const details = await reportType.getDetails();
          const template = await loadTemplate(details.template);
          const generatedAt = new Date();

          const payload = await reportType.generate({
            options: report.options,
          });

          const source = ejs.render(template, {
            data: payload,
            metadata: {
              name: report.name,
              humanId: report.humanId,
              id: report.id,
              generatedAt,
              revision: report.revision,
            },
            utils: {
              formatEuro,
              formatDate: datefns.format,
              sumEuroValues,
              subEuroValues,
              euro,
              cents,
            },
          });

          const pdf = await render(source, details.scale ?? 0.8);

          await saveReport(report.id, pdf);
          await updateReportStatus(ctx.context.pg, report.id, 'finished');
          await ctx.emit(defs.onReportStatusChanged, {
            report: id,
            status: 'finished',
          });
        } catch (err) {
          console.error('Report generation failed: ', err);
          await updateReportStatus(ctx.context.pg, report.id, 'failed');
          await ctx.emit(defs.onReportStatusChanged, {
            report: id,
            status: 'failed',
          });
          throw err;
        }
      },
    });
  },
});
