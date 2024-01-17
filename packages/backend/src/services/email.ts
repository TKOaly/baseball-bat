import axios from 'axios';
import * as fs from 'fs/promises';
import * as path from 'path';
import sql from 'sql-template-strings';
import mjml2html from 'mjml';
import nodemailer from 'nodemailer';
import ejs from 'ejs';
import * as dateFns from 'date-fns';
import { Inject, Service } from 'typedi';
import { Config } from '../config';
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

const TemplateType = {
  HTML: 'html',
  TEXT: 'text',
};

type TemplateType = (typeof TemplateType)[keyof typeof TemplateType];

@Service()
export class EmailService {
  pg: PgClient;

  private transport: IEmailTransport;

  constructor(
    transport: IEmailTransport,
    pg: PgClient,
    @Inject() public jobService: JobService,
    private config: Config,
  ) {
    this.transport = transport;
    this.pg = pg;
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

  get templatesDir() {
    return path.resolve(this.config.assetPath, 'templates/emails');
  }

  async getTemplatePath(name: string, type: TemplateType) {
    const exts = type === TemplateType.HTML ? ['mjml', 'html'] : ['txt'];

    for (const ext of exts) {
      const filepath = path.resolve(this.templatesDir, `${name}.${ext}`);
      console.log('Trying', filepath);

      try {
        const result = await fs.stat(filepath);

        if (result.isFile()) {
          return filepath;
        }
      } catch (err) {
        continue;
      }
    }

    throw new Error(
      `Could not find template "${name}" of type "${type}" from ${this.templatesDir}`,
    );
  }

  async sendRawEmail(options: EmailTransportOptions) {
    return this.transport.sendEmail(options);
  }

  async sendEmailDirect(options: SendEmailOptions) {
    const html = await this.renderTemplate(
      options.template,
      TemplateType.HTML,
      options.payload,
    );
    const text = await this.renderTemplate(
      options.template,
      TemplateType.TEXT,
      options.payload,
    );

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

  async renderTemplate(name: string, type: TemplateType, payload: object) {
    const template = await this.getTemplatePath(name, type);
    const ext = path.extname(template).substring(1);

    const data = {
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
    };

    const opts = {
      filename: template,
    };

    const rendered = await ejs.renderFile(template, data, opts);

    if (ext === 'mjml') {
      const result = mjml2html(rendered).html;

      return result;
    }

    return rendered;
  }

  async createEmail(email: NewEmail) {
    const html = await this.renderTemplate(
      email.template,
      TemplateType.HTML,
      email.payload,
    );
    const text = await this.renderTemplate(
      email.template,
      TemplateType.TEXT,
      email.payload,
    );

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
