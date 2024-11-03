import axios from 'axios';
import opentelemetry, { SpanStatusCode } from '@opentelemetry/api';
import * as fs from 'fs/promises';
import * as path from 'path';
import routes from './api';
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
import { BusContext } from '@/app';
import iface, * as defs from './definitions';
import { Connection } from '@/db/connection';
import { ExecutionContext } from '@/bus';
import { createModule } from '@/module';
import { createPaginatedQuery } from '@/db/pagination';

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

const emailQuery = createPaginatedQuery<DbEmail>(
  sql`SELECT * FROM emails`,
  'id',
);

export default createModule({
  name: 'emails',

  routes,

  async setup({ jobs, config, bus, emailTransport: transport }) {
    async function handleEmailJob(
      ctx: ExecutionContext<BusContext>,
      job: EmailJob,
    ) {
      if (job.name === 'send') {
        try {
          await _sendEmail(ctx, ctx.context.pg, job.data.emailId);
        } catch (err) {
          throw new Error(`Sending email failed: ${err}`);
        }

        return { result: 'success' };
      } else {
        return { result: 'success' };
      }
    }

    const templatesDir = path.resolve(config.assetPath, 'templates/emails');

    async function getTemplatePath(name: string, type: TemplateType) {
      const tracer = opentelemetry.trace.getTracer('baseball-bat');

      const attributes = {
        template_name: name,
        template_type: type,
      };

      return tracer.startActiveSpan(
        'resolving template',
        { attributes },
        async span => {
          const exts = type === TemplateType.HTML ? ['mjml', 'html'] : ['txt'];

          for (const ext of exts) {
            const filepath = path.resolve(templatesDir, `${name}.${ext}`);

            try {
              const result = await fs.stat(filepath);

              if (result.isFile()) {
                span.end();
                return filepath;
              }
            } catch (err) {
              continue;
            }
          }

          const error = `Could not find template "${name}" of type "${type}" from ${templatesDir}`;

          span.setStatus({
            message: error,
            code: SpanStatusCode.ERROR,
          });

          throw new Error(error);
        },
      );
    }

    async function sendRawEmail(options: EmailTransportOptions) {
      return transport.sendEmail(options);
    }

    bus.provide(iface, {
      async sendEmailDirect(options) {
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
      },

      async createEmail(email, { pg }) {
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
              pg.many(sql`
                INSERT INTO email_debt_mapping (email_id, debt_id)
                VALUES (${result.id}, ${debt})
              `),
            ),
          );
        }

        return formatEmail(result);
      },

      async batchSendEmails(ids, _, bus) {
        const children = await Promise.all(
          ids.map(id => createEmailJobDescription(bus, id)),
        );

        await jobs.createJob({
          queueName: 'emails',
          name: 'batch',
          data: { name: `Send ${ids.length} emails` },
          children,
        });
      },

      async sendEmail(id, _, bus) {
        const description = await createEmailJobDescription(bus, id);

        await jobs.createJob(description);
      },

      async getEmails(query, { pg }) {
        return emailQuery(pg, {
          ...query,
          order: query.sort ? [[query.sort.column, query.sort.dir]] : undefined,
          map: formatEmail,
        });
      },

      async getEmail(id, { pg }) {
        const email = await pg.one<DbEmail>(
          sql`SELECT * FROM emails WHERE id = ${id}`,
        );

        return email && formatEmail(email);
      },

      async getEmailsByDebt({ debtId, ...query }, { pg }) {
        return emailQuery(pg, {
          ...query,
          where: sql`id IN (SELECT email_id FROM email_debt_mapping WHERE debt_id = ${debtId})`,
          order: query.sort ? [[query.sort.column, query.sort.dir]] : undefined,
          map: formatEmail,
        });
      },
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

      const tracer = opentelemetry.trace.getTracer('baseball-bat');

      const attributes = {
        template,
        template_type: type,
      };

      return tracer.startActiveSpan(
        `rendering email`,
        { attributes },
        async span => {
          const rendered = await tracer.startActiveSpan(
            `rendering ejs`,
            async subspan => {
              const rendered = await ejs.renderFile(template, data, opts);
              subspan.end();
              return rendered;
            },
          );

          if (ext === 'mjml') {
            return tracer.startActiveSpan(`rendering mjml`, async subspan => {
              const result = mjml2html(rendered).html;

              subspan.end();
              span.end();

              return result;
            });
          }

          span.end();
          return rendered;
        },
      );
    }

    async function _sendEmail(
      bus: ExecutionContext<BusContext>,
      pg: Connection,
      id: string,
    ) {
      const email = await bus.exec(defs.getEmail, id);

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

      await pg.do(sql`UPDATE emails SET sent_at = NOW() WHERE id = ${id}`);
    }

    async function createEmailJobDescription(
      bus: ExecutionContext<BusContext>,
      id: string,
    ) {
      const email = await bus.exec(defs.getEmail, id);

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

    await jobs.createWorker('emails', handleEmailJob as any, {
      limiter: {
        max: 1,
        duration: 1000,
      },
    });
  },
});
