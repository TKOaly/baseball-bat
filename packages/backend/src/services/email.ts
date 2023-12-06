import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import sql from 'sql-template-strings';
import mjml2html from 'mjml';
import nodemailer from 'nodemailer';
import ejs from 'ejs';
import * as dateFns from 'date-fns';
import { Inject, Service } from 'typedi';
import { Config } from '../config';
import { pipe } from 'fp-ts/lib/function';
import * as record from 'fp-ts/lib/Record';
import { map, reduce } from 'fp-ts/lib/Array';
import { groupBy } from 'fp-ts/lib/NonEmptyArray';
import { PgClient } from '../db';
import { DbEmail, Email, InternalIdentity } from '@bbat/common/build/src/types';
import {
  formatEuro,
  sumEuroValues,
  euro,
  cents,
  EuroValue,
} from '@bbat/common/build/src/currency';
import {
  formatBarcode,
  generateBarcodeImage,
} from '@bbat/common/build/src/virtual-barcode';
import { formatReferenceNumber } from './payements';
import { JobService } from './jobs';
import { Job } from 'bullmq';

type SendEmailOptions = {
  recipient: string;
  subject: string;
  template: string;
  payload: object;
};

type EmailTemplate = {
  html?: { filetype: string; content: string };
  text?: { filetype: string; content: string };
};

type Template = {
  name: string;
  filetype: string;
  content: string;
};

type NewEmail = {
  recipient: string;
  subject: string;
  template: string;
  payload: object;
  debts?: string[];
};

const formatEmail = (email: DbEmail): Email => ({
  id: email.id,
  recipient: email.recipient,
  subject: email.subject,
  template: email.template,
  html: email.html,
  text: email.text,
  draft: email.draft,
  createdAt: email.created_at,
  sentAt: email.sent_at,
});

type EmailTransportOptions = {
  from: string;
  replyTo?: string;
  to: string;
  subject: string;
  text: string;
  html: string | null;
};

export interface IEmailTransport {
  sendEmail(options: EmailTransportOptions): Promise<void>;
}

export const createEmailDispatcherTransport = (
  config: NonNullable<Config['emailDispatcher']>,
) => {
  const client = axios.create({
    baseURL: config.url,
    headers: {
      'X-Token': config.token,
    },
  });

  return {
    async sendEmail(options: EmailTransportOptions) {
      await client.post('/', {
        body: {
          to: options.to,
          from: options.from,
          subject: options.subject,
          body: options.text,
        },
      });
    },
  };
};

type SMTPConfig = {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  password?: string;
};

export const createSMTPTransport = (config: SMTPConfig) => {
  let auth = undefined;

  if (config.user || config.password) {
    auth = {
      user: config.user,
      pass: config.password,
    };
  }

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth,
  });

  return {
    async sendEmail(options: EmailTransportOptions) {
      await transporter.sendMail({
        from: options.from,
        to: options.to,
        replyTo: options.replyTo,
        subject: options.subject,
        text: options.text,
        html: options.html ?? undefined,
      });
    },
  };
};

type EmailSendJobData = {
  emailId: string;
};

type EmailSendJobResult = { result: 'error' } | { result: 'success' };
type EmailBatchSendJobResult = { result: 'error' } | { result: 'success' };

type EmailSendJob = Job<EmailSendJobData, EmailSendJobResult, 'send'>;
type EmailBatchSendJob = Job<void, EmailBatchSendJobResult, 'batch'>;

type EmailJob = EmailSendJob | EmailBatchSendJob;

@Service()
export class EmailService {
  @Inject(() => Config)
  config: Config;

  // @Inject(() => PgClient)
  pg: PgClient;

  private transport: IEmailTransport;

  private templates: Record<string, EmailTemplate>;

  constructor(
    transport: IEmailTransport,
    pg: PgClient,
    @Inject() public jobService: JobService,
  ) {
    this.transport = transport;
    this.pg = pg;
    this.loadTemplates();
    this.jobService.createWorker(
      'emails',
      this.handleEmailJob.bind(this) as any,
      {
        limiter: {
          max: 1,
          duration: 1000,
        },
      },
    );
  }

  private async handleEmailJob(job: EmailJob) {
    if (job.name === 'send') {
      try {
        await this._sendEmail(job.data.emailId);
      } catch (err) {
        return {
          result: 'error',
          message: `Sending email failed: ${err}`,
        };
      }

      return { result: 'success' };
    } else {
      return { result: 'success' };
    }
  }

  loadTemplates() {
    const templatesDir = {
      production: '/app/templates',
      development: path.resolve(__dirname, '../../templates'),
      testing: path.resolve(__dirname, '../../../../backend/templates'),
    }[process.env.NODE_ENV ?? 'development'];

    if (templatesDir === undefined) {
      throw new Error(`Unknown NODE_ENV "${process.env.NODE_ENV}"`);
    }

    const files: Array<string> = fs.readdirSync(templatesDir);

    this.templates = pipe(
      files,
      map((filename): Template => {
        const parts = filename.split('.');
        const filetype = parts.pop() ?? '';
        const name = parts.join('.');
        const filepath = path.join(templatesDir, filename);
        const content = fs.readFileSync(filepath, { encoding: 'utf8' });

        return {
          name,
          filetype,
          content,
        };
      }),
      groupBy((r: Template) => r.name),
      record.map(
        reduce({} as EmailTemplate, (acc, { filetype, content }: Template) => {
          const kind = { mjml: 'html', html: 'html', txt: 'text' }[filetype];

          if (!kind) {
            return acc;
          }

          return {
            ...acc,
            [kind]: { filetype, content },
          };
        }),
      ),
    );
  }

  async sendRawEmail(options: EmailTransportOptions) {
    return this.transport.sendEmail(options);
  }

  async sendEmailDirect(options: SendEmailOptions) {
    const html = this.renderTemplate(options.template, 'html', options.payload);
    const text = this.renderTemplate(options.template, 'text', options.payload);

    if (!text) {
      return Promise.reject();
    }

    return this.sendRawEmail({
      to: options.recipient,
      from: 'velat@tko-aly.fi',
      replyTo: 'rahastonhoitaja@tko-aly.fi',
      subject: options.subject,
      text,
      html,
    });
  }

  renderTemplate(name: string, type: 'html' | 'text', payload: object) {
    const template = this.templates[name];

    if (!template) {
      return null;
    }

    const populate = (template: string) =>
      ejs.render(template, {
        ...payload,
        dateFns,
        formatEuro,
        formatReferenceNumber,
        sumEuroValues,
        euro,
        cents,
        formatDate: (d: number | Date) => dateFns.format(d, 'dd.MM.yyyy'),
        formatBarcode: (
          iban: string,
          amount: EuroValue,
          reference: string,
          date: Date,
        ) => formatBarcode(iban, amount.value / 100, reference, date),
        generateBarcodeImage,
      });

    if (type === 'html') {
      if (!template.html) return null;

      if (template.html.filetype === 'mjml') {
        return mjml2html(populate(template.html.content)).html;
      } else {
        return populate(template.html.content);
      }
    } else {
      if (!template.text) return null;

      return populate(template.text.content);
    }
  }

  async createEmail(email: NewEmail) {
    let html;
    let text;

    try {
      html = this.renderTemplate(email.template, 'html', email.payload);
    } catch (error) {
      console.error(
        `Failed to render HTML template '${email.template}': ${error}`,
      );
    }

    try {
      text = this.renderTemplate(email.template, 'text', email.payload);
    } catch (error) {
      console.error(
        `Failed to render text template '${email.template}': ${error}`,
      );
    }

    const result = await this.pg.one<DbEmail>(sql`
        INSERT INTO emails (recipient, subject, template, html, text)
        VALUES (${email.recipient}, ${email.subject}, ${email.template}, ${html}, ${text})
        RETURNING *
     `);

    if (!result) {
      return null;
    }

    if (email.debts) {
      await Promise.all(
        email.debts.map(debt =>
          this.pg.any(sql`
        INSERT INTO email_debt_mapping (email_id, debt_id)
        VALUES (${result.id}, ${debt})
      `),
        ),
      );
    }

    return formatEmail(result);
  }

  async _sendEmail(id: string) {
    const email = await this.getEmail(id);

    if (!email) {
      throw 'No such email';
    }

    await this.sendRawEmail({
      to: email.recipient,
      from: 'velat@tko-aly.fi',
      replyTo: 'rahastonhoitaja@tko-aly.fi',
      subject: email.subject,
      text: email.text,
      html: email.html,
    });

    await this.pg.any(sql`UPDATE emails SET sent_at = NOW() WHERE id = ${id}`);
  }

  async batchSendEmails(ids: string[], { jobName }: { jobName?: string } = {}) {
    const jobs = await Promise.all(
      ids.map(id => this.createEmailJobDescription(id)),
    );

    await this.jobService.createJob({
      queueName: 'emails',
      name: 'batch',
      data: { name: jobName ?? `Send ${ids.length} emails` },
      children: jobs,
    });
  }

  async createEmailJobDescription(id: string) {
    const email = await this.getEmail(id);

    return {
      queueName: 'emails',
      name: 'send',
      data: {
        name: `Send email to ${email?.recipient}`,
        emailId: id,
      },
      opts: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 60 * 2000,
        },
      },
    };
  }

  async sendEmail(id: string) {
    const description = await this.createEmailJobDescription(id);

    await this.jobService.createJob(description);
  }

  async getEmails() {
    const emails = await this.pg.any<DbEmail>(sql`SELECT * FROM emails`);

    return emails.map(formatEmail);
  }

  async getEmail(id: string) {
    const email = await this.pg.one<DbEmail>(
      sql`SELECT * FROM emails WHERE id = ${id}`,
    );

    return email && formatEmail(email);
  }

  async getEmailsByAddress(email: string) {
    const emails = await this.pg.any<DbEmail>(
      sql`SELECT * FROM emails WHERE recipient = ${email}`,
    );

    return emails.map(formatEmail);
  }

  async getEmailsByPayer(payer: InternalIdentity) {
    const emails = await this.pg.any<DbEmail>(sql`
        SELECT emails.*
        FROM payer_emails
        JOIN emails ON emails.recipient = payer_emails.email
        WHERE payer_emails.payer_id = ${payer.value}
      `);

    return emails.map(formatEmail);
  }

  async getEmailsByDebt(debt: string) {
    const emails = await this.pg.any<DbEmail>(sql`
        SELECT emails.*
        FROM email_debt_mapping edm
        JOIN emails ON emails.id = edm.email_id
        WHERE edm.debt_id = ${debt}
      `);

    return emails.map(formatEmail);
  }
}
