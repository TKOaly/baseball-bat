import axios from 'axios';
import * as fs from 'fs/promises';
import * as path from 'path';
import sql from 'sql-template-strings';
import mjml2html from 'mjml';
import nodemailer from 'nodemailer';
import ejs from 'ejs';
import * as dateFns from 'date-fns';
import { Config } from '../../config';
import { DbEmail, Email } from '@bbat/common/build/src/types';
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
import { formatReferenceNumber } from '../payments';
import { Job } from 'bullmq';
import { ModuleDeps } from '@/app';
import * as defs from './definitions';

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

export default ({
  jobs,
  config,
  bus,
  pg,
  emailTransport: transport,
}: ModuleDeps) => {
  async function handleEmailJob(job: EmailJob) {
    if (job.name === 'send') {
      try {
        await _sendEmail(job.data.emailId);
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

  const templatesDir = path.resolve(config.assetPath, 'templates/emails');

  async function getTemplatePath(name: string, type: TemplateType) {
    const exts = type === TemplateType.HTML ? ['mjml', 'html'] : ['txt'];

    for (const ext of exts) {
      const filepath = path.resolve(templatesDir, `${name}.${ext}`);

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
      `Could not find template "${name}" of type "${type}" from ${templatesDir}`,
    );
  }

  async function sendRawEmail(options: EmailTransportOptions) {
    return transport.sendEmail(options);
  }

  bus.register(defs.sendEmailDirect, async options => {
    const html = await renderTemplate(
      options.template,
      TemplateType.HTML,
      options.payload,
    );
    const text = await renderTemplate(
      options.template,
      TemplateType.TEXT,
      options.payload,
    );

    if (!text) {
      return Promise.reject();
    }

    return sendRawEmail({
      to: options.recipient,
      from: 'velat@tko-aly.fi',
      replyTo: 'rahastonhoitaja@tko-aly.fi',
      subject: options.subject,
      text,
      html,
    });
  });

  async function renderTemplate(
    name: string,
    type: TemplateType,
    payload: object,
  ) {
    const template = await getTemplatePath(name, type);
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

  bus.register(defs.createEmail, async email => {
    const html = await renderTemplate(
      email.template,
      TemplateType.HTML,
      email.payload,
    );
    const text = await renderTemplate(
      email.template,
      TemplateType.TEXT,
      email.payload,
    );

    const result = await pg.one<DbEmail>(sql`
        INSERT INTO emails (recipient, subject, template, html, text)
        VALUES (${email.recipient}, ${email.subject}, ${email.template}, ${html}, ${text})
        RETURNING *
     `);

    if (!result) {
      throw new Error('Failed to create email!');
    }

    if (email.debts) {
      await Promise.all(
        email.debts.map(debt =>
          pg.any(sql`
        INSERT INTO email_debt_mapping (email_id, debt_id)
        VALUES (${result.id}, ${debt})
      `),
        ),
      );
    }

    return formatEmail(result);
  });

  async function _sendEmail(id: string) {
    const email = await getEmail(id);

    if (!email) {
      throw 'No such email';
    }

    await sendRawEmail({
      to: email.recipient,
      from: 'velat@tko-aly.fi',
      replyTo: 'rahastonhoitaja@tko-aly.fi',
      subject: email.subject,
      text: email.text,
      html: email.html,
    });

    await pg.any(sql`UPDATE emails SET sent_at = NOW() WHERE id = ${id}`);
  }

  bus.register(defs.batchSendEmails, async ids => {
    const children = await Promise.all(
      ids.map(id => createEmailJobDescription(id)),
    );

    await jobs.createJob({
      queueName: 'emails',
      name: 'batch',
      data: { name: `Send ${ids.length} emails` },
      children,
    });
  });

  async function createEmailJobDescription(id: string) {
    const email = await getEmail(id);

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

  bus.register(defs.sendEmail, async id => {
    const description = await createEmailJobDescription(id);

    await jobs.createJob(description);
  });

  bus.register(defs.getEmails, async () => {
    const emails = await pg.any<DbEmail>(sql`SELECT * FROM emails`);

    return emails.map(formatEmail);
  });

  async function getEmail(id: string) {
    const email = await pg.one<DbEmail>(
      sql`SELECT * FROM emails WHERE id = ${id}`,
    );

    return email && formatEmail(email);
  }

  bus.register(defs.getEmail, getEmail);

  /*async function getEmailsByAddress(email: string) {
    const emails = await pg.any<DbEmail>(
      sql`SELECT * FROM emails WHERE recipient = ${email}`,
    );

    return emails.map(formatEmail);
  }

  async function getEmailsByPayer(payer: InternalIdentity) {
    const emails = await pg.any<DbEmail>(sql`
        SELECT emails.*
        FROM payer_emails
        JOIN emails ON emails.recipient = payer_emails.email
        WHERE payer_emails.payer_id = ${payer.value}
      `);

    return emails.map(formatEmail);
  }*/

  bus.register(defs.getEmailsByDebt, async debt => {
    const emails = await pg.any<DbEmail>(sql`
        SELECT emails.*
        FROM email_debt_mapping edm
        JOIN emails ON emails.id = edm.email_id
        WHERE edm.debt_id = ${debt}
      `);

    return emails.map(formatEmail);
  });

  jobs.createWorker('emails', handleEmailJob as any, {
    limiter: {
      max: 1,
      duration: 1000,
    },
  });
};
