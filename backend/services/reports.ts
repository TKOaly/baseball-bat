import { Inject, Service } from "typedi";
import { PgClient } from "../db";
import * as puppeteer from "puppeteer";
import { Browser } from "puppeteer";
import sql from 'sql-template-strings';
import { Config } from "../config";
import * as path from 'path';
import * as fs from 'fs';
import * as uuid from 'uuid';
import { DbReport, Report } from "../../common/types";
import ejs from "ejs";
import { cents, euro, formatEuro, sumEuroValues } from "../../common/currency";
import * as datefns from 'date-fns';

export type CreateReportOptions = {
  template: string
  name: string
  payload: unknown
};

export type SaveReportOptions = {
  generatedAt?: Date,
  name: string,
  content: Buffer,
};

const formatReport = (db: DbReport): Report => ({
  id: db.id,
  name: db.name,
  generatedAt: db.generated_at,
  humanId: db.human_id,
});

@Service()
export class ReportService {
  @Inject(() => PgClient)
  pg: PgClient;

  @Inject(() => Config)
  config: Config;

  _browser: Browser | null = null;

  private async getBrowser() {
    if (this._browser === null) {
      this._browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox'],
      });
    }

    return this._browser;
  }

  private async render(source: string) {
    const browser = await this.getBrowser();
    const page = await browser.newPage();

    await page.setContent(source, {
      waitUntil: 'domcontentloaded',
    });

    await page.waitForSelector('style');

    await page.addStyleTag({
      content: `
        html {
          -webkit-print-color-adjust: exact;
        }
      `,
    });

    const pdf = await page.pdf({
      format: 'A4',
      scale: 0.8,
      landscape: true,
    });

    await page.close();
    await browser.close();
    this._browser = null;

    return pdf;
  }

  private async loadTemplate(name: string): Promise<string> {
    const templateBasePath = path.join(this.config.assetPath, 'templates', 'reports');
    const templatePath = path.join(templateBasePath, `${name}.ejs`);
    const content = await fs.promises.readFile(templatePath, 'utf8');
    return content;
  }

  async saveReport(options: SaveReportOptions): Promise<Report | null> {
    const id = uuid.v4();

    const reportDir = path.join(this.config.dataPath, 'reports');
    const reportPath = path.join(reportDir, `${id}.pdf`);

    try {
      await fs.promises.access(reportDir, fs.constants.F_OK);
    } catch (e) {
      await fs.promises.mkdir(reportDir, { recursive: true });
    }

    await fs.promises.writeFile(reportPath, options.content, {
      encoding: 'binary',
      flag: 'w',
    });

    const report = await this.pg.one<DbReport>(sql`
      INSERT INTO reports (id, name, generated_at) VALUES (${id}, ${options.name}, COALESCE(${options.generatedAt}, NOW())) RETURNING *;
    `);

    return report && formatReport(report);
  }

  async createReport(options: CreateReportOptions): Promise<Report | null> {
    const template = await this.loadTemplate(options.template);
    const generatedAt = new Date();

    const source = ejs.render(template, {
      data: options.payload,
      metadata: {
        name: options.name,
        generatedAt,
      },
      utils: {
        formatEuro,
        formatDate: datefns.format,
        sumEuroValues,
        euro,
        cents,
      },
    });

    const pdf = await this.render(source);

    const report = await this.saveReport({
      generatedAt,
      content: pdf,
      name: options.name,
    });

    return report;
  }

  async getReport(id: string): Promise<Report | null> {
    const report = await this.pg.one<DbReport>(sql`SELECT * FROM reports WHERE id = ${id}`);

    return report && formatReport(report);
  }

  async getReportContent(id: string): Promise<Buffer | null> {
    const reportPath = path.join(this.config.dataPath, 'reports', `${id}.pdf`);
    return fs.promises.readFile(reportPath);
  }

  async getReports() {
    const reports = await this.pg.any<DbReport>(sql`
      SELECT id, name, generated_at, human_id FROM reports
    `);

    return reports.map(formatReport);
  }
}
