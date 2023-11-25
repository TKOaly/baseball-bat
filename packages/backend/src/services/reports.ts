import { Inject, Service } from 'typedi';
import { PgClient } from '../db';
import * as t from 'io-ts';
import * as puppeteer from 'puppeteer';
import { Browser } from 'puppeteer';
import sql from 'sql-template-strings';
import { Config } from '../config';
import * as path from 'path';
import * as fs from 'fs';
import * as uuid from 'uuid';
import {
  DbReport,
  InternalIdentity,
  internalIdentity,
  Report,
} from '@bbat/common/build/src/types';
import ejs from 'ejs';
import { cents, euro, formatEuro, sumEuroValues } from '@bbat/common/build/src/currency';
import * as datefns from 'date-fns';
import { DebtService } from './debt';
import { PaymentService } from './payements';
import { isRight } from 'fp-ts/lib/Either';

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
  generatedAt: db.generated_at,
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

@Service()
export class ReportService {
  @Inject(() => PgClient)
  pg: PgClient;

  @Inject(() => Config)
  config: Config;

  @Inject(() => DebtService)
  debtService: DebtService;

  @Inject(() => PaymentService)
  paymentService: PaymentService;

  _browser: Browser | null = null;

  private async getBrowser() {
    if (this._browser === null) {
      this._browser = await puppeteer.launch({
        executablePath: this.config.chromiumBinaryPath ?? undefined,
        headless: true,
        args: ['--no-sandbox'],
      });
    }

    return this._browser;
  }

  private async render(source: string, scale = 0.8) {
    const browser = await this.getBrowser();
    const page = await browser.newPage();

    await page.setContent(source, {
      waitUntil: 'domcontentloaded',
    });

    // await page.waitForSelector('head style');

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
    this._browser = null;

    return pdf;
  }

  private async loadTemplate(name: string): Promise<string> {
    const templateBasePath = path.join(
      this.config.assetPath,
      'templates',
      'reports',
    );
    const templatePath = path.join(templateBasePath, `${name}.ejs`);
    const content = await fs.promises.readFile(templatePath, 'utf8');
    return content;
  }

  async reserveReport(
    options: SaveReportOptions,
  ): Promise<Omit<Report, 'history'> | null> {
    const id = uuid.v4();

    console.log(options.generatedBy);

    const report = await this.pg.one<Omit<DbReport, 'history'>>(
      sql`
      INSERT INTO reports (id, name, generated_at, options, type, generated_by, revision)
      VALUES (
        ${id},
        ${options.name},
        COALESCE(${options.generatedAt}, NOW()),
        ${options.options},
        ${options.type},
        ${options.generatedBy.value},
      `.append(
        options.parent
          ? sql`(SELECT revision + 1 FROM reports WHERE id = ${options.parent})`
          : sql`1`,
      ).append(sql`
      )
      RETURNING *;
    `),
    );

    if (report && options.parent) {
      await this.pg.any(
        sql`UPDATE reports SET superseded_by = ${report.id} WHERE id = ${options.parent}`,
      );
    }

    return report && formatReport(report);
  }

  async updateReportStatus(
    id: string,
    status: 'finished' | 'failed',
  ): Promise<Omit<Report, 'history'> | null> {
    const report = await this.pg.one<Omit<DbReport, 'history'>>(sql`
      UPDATE reports
      SET status = ${status}
      WHERE id = ${id}
      RETURNING *
    `);

    return report && formatReport(report);
  }

  async saveReport(id: string, content: Buffer) {
    const reportDir = path.join(this.config.dataPath, 'reports');
    const reportPath = path.join(reportDir, `${id}.pdf`);

    try {
      await fs.promises.access(reportDir, fs.constants.F_OK);
    } catch (e) {
      await fs.promises.mkdir(reportDir, { recursive: true });
    }

    await fs.promises.writeFile(reportPath, content, {
      encoding: 'binary',
      flag: 'w',
    });
  }

  async createReport(
    options: CreateReportOptions,
  ): Promise<Omit<Report, 'history'> | null> {
    const template = await this.loadTemplate(options.template);
    const generatedAt = new Date();

    const report = await this.reserveReport({
      generatedAt,
      name: options.name,
      options: options.options,
      type: options.template,
      parent: options.parent,
      generatedBy: options.generatedBy,
    });

    if (!report) {
      return null;
    }

    try {
      const source = ejs.render(template, {
        data: options.payload,
        metadata: {
          name: options.name,
          humanId: report.humanId,
          id: report.id,
          generatedAt,
          revision: report.revision,
        },
        utils: {
          formatEuro,
          formatDate: datefns.format,
          sumEuroValues,
          euro,
          cents,
        },
      });

      const pdf = await this.render(source, options.scale ?? 0.8);

      await this.saveReport(report.id, pdf);
    } catch (err) {
      return await this.updateReportStatus(report.id, 'failed');
    }

    return await this.updateReportStatus(report.id, 'finished');
  }

  async getReport(id: string): Promise<Report | null> {
    const report = await this.pg.one<DbReport>(sql`
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
  }

  async getReportContent(id: string): Promise<Buffer | null> {
    const reportPath = path.join(this.config.dataPath, 'reports', `${id}.pdf`);
    return fs.promises.readFile(reportPath);
  }

  async getReports() {
    const reports = await this.pg.any<DbReport>(sql`
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
  }

  async refreshReport(id: string, generatedBy: InternalIdentity) {
    const report = await this.getReport(id);

    if (!report) {
      return;
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

        return await this.debtService.generateDebtLedger(
          {
            startDate: new Date(options.startDate),
            endDate: new Date(options.endDate),
            centers: options.centers,
            groupBy: options.groupBy,
            includeDrafts: options.includeDrafts,
          },
          generatedBy,
          report.id,
        );
      } else {
        return;
      }
    } else if (report.type === 'payment-ledger') {
      const optionsType = t.type({
        startDate: t.string,
        endDate: t.string,
        paymentType: t.union([t.null, t.literal('cash'), t.literal('invoice')]),
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

        return await this.paymentService.generatePaymentLedger(
          {
            startDate: new Date(options.startDate),
            endDate: new Date(options.endDate),
            centers: options.centers,
            groupBy: options.groupBy,
            eventTypes: options.eventTypes,
            paymentType: options.paymentType,
          },
          generatedBy,
          report.id,
        );
      } else {
        return;
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

        return await this.debtService.generateDebtStatusReport(
          {
            date: new Date(options.date),
            centers: options.centers,
            groupBy: options.groupBy,
            includeOnly: options.includeOnly ?? null,
          },
          generatedBy,
          report.id,
        );
      } else {
        console.log('Upps');
        return;
      }
    } else {
      console.log('Unknown report type.');
      return;
    }
  }
}
