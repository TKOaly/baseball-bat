import axios from 'axios';
import opentelemetry, { SpanStatusCode } from '@opentelemetry/api';
import * as fs from 'fs/promises';
import * as path from 'path';
import routes from './api';
import { sql } from '@/db/template';
import mjml2html from 'mjml';
import nodemailer from 'nodemailer';
import ejs from 'ejs';
import * as dateFns from 'date-fns';
import { Config } from '../../config';
import { DbEmail } from '@bbat/common/build/src/types';
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
import iface, * as defs from './definitions';
import * as jobs from '@/modules/jobs/definitions';
import { createModule } from '@/module';
import { emailQuery, formatEmail } from './query';

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

const TemplateType = {
  HTML: 'html',
  TEXT: 'text',
};

type TemplateType = (typeof TemplateType)[keyof typeof TemplateType];

export default createModule({
  name: 'emails',

  routes,

  async setup({ config, bus, emailTransport: transport }) {
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
        await Promise.all(ids.map(id => bus.exec(defs.sendEmail, id)));
      },

      async sendEmail(id, _, bus) {
        const email = await bus.exec(defs.getEmail, id);

        if (!email) {
          throw new Error('No such email!');
        }

        await bus.exec(jobs.create, {
          type: 'send-email',
          data: { id },
          title: `Send email to ${email.recipient}`,
          retries: 3,
          retryDelay: 300,
          concurrencyLimit: 1,
          ratelimit: 1,
          ratelimitPeriod: 1,
        });
      },

      async getEmails(query, { pg }) {
        return emailQuery.execute(pg, {
          ...query,
          order: query.sort ? [[query.sort.column, query.sort.dir]] : undefined,
        });
      },

      async getEmail(id, { pg }) {
        const { result } = await emailQuery.execute(pg, {
          where: sql`id = ${id}`,
          limit: 1,
        });

        return result[0];
      },

      async getEmailsByDebt({ debtId, ...query }, { pg }) {
        return emailQuery.execute(pg, {
          ...query,
          where: sql`id IN (SELECT email_id FROM email_debt_mapping WHERE debt_id = ${debtId})`,
          order: query.sort ? [[query.sort.column, query.sort.dir]] : undefined,
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

    bus.provideNamed(jobs.executor, 'send-email', {
      async execute({ data }, { pg }, bus) {
        const { id } = data as { id: string };

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
      },
    });
  },
});
