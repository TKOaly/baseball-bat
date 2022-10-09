import axios, { AxiosInstance } from 'axios';
import * as fs from 'fs'
import * as path from 'path'
import sql from 'sql-template-strings'
import mjml2html from 'mjml'
import nodemailer from 'nodemailer'
import ejs from 'ejs'
import * as fp from 'fp-ts'
import * as R from 'remeda'
import * as dateFns from 'date-fns'
import { Inject, Service } from 'typedi'
import { Config } from '../config';
import { flow, pipe } from 'fp-ts/lib/function';
import { filter } from 'fp-ts/lib/Filterable';
import * as record from 'fp-ts/lib/Record';
import { map, reduce } from 'fp-ts/lib/Array'
import { groupBy } from 'fp-ts/lib/NonEmptyArray'
import { foldMap } from 'fp-ts/lib/Foldable';
import { PgClient } from '../db';
import { DbEmail, Email, InternalIdentity } from '../../common/types';
import { formatEuro, sumEuroValues, euro, cents } from '../../common/currency';

type RawEmail = {
  to: string
  subject: string
  message: string
  from: string
}

type SendEmailOptions = {
  recipient: string
  subject: string
  template: string
  payload: object
}

type EmailTemplate = {
  html?: { filetype: string, content: string }
  text?: { filetype: string, content: string }
}

type Template = {
  name: string
  filetype: string
  content: string
}

type NewEmail = {
  recipient: string
  subject: string
  template: string
  payload: object
}

const formatEmail = (email: DbEmail): Email => ({
  id: email.id,
  recipient: email.recipient,
  subject: email.subject,
  template: email.template,
  html: email.html,
  text: email.text,
  draft: email.draft,
  createdAt: email.created_at,
  sentAt: email.sent_at
})

type EmailTransportOptions = {
  from: string,
  to: string,
  subject: string,
  text: string,
  html: string | null,
}

export interface IEmailTransport {
  sendEmail(options: EmailTransportOptions): Promise<void>
}

export const createEmailDispatcherTransport = (config: NonNullable<Config['emailDispatcher']>) => {
  const client = axios.create({
    baseURL: config.url,
    headers: {
      'X-Token': config.token,
    }
  });

  return {
    async sendEmail(options: EmailTransportOptions) {
      await client
        .post('/', {
          body: {
            to: options.to,
            from: options.from,
            subject: options.subject,
            body: options.text,
          },
        })
    }
  }
}

type SMTPConfig = {
  host: string
  port: number
  secure: boolean
  user?: string
  password?: string
}

export const createSMTPTransport = (config: SMTPConfig) => {
  let auth = undefined

  if (config.user || config.password) {
    auth = {
      user: config.user!,
      pass: config.password,
    }
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
        subject: options.subject,
        text: options.text,
        html: options.html ?? undefined,
      })
    }
  }
}

@Service()
export class EmailService {
  @Inject(() => Config)
  config: Config

  // @Inject(() => PgClient)
  pg: PgClient

  private transport: IEmailTransport

  private templates: Record<string, EmailTemplate>

  constructor(transport: IEmailTransport, pg: PgClient) {
    this.transport = transport
    this.pg = pg
    this.loadTemplates()
  }

  loadTemplates() {
    const templatesDir = path.resolve(__dirname, '../templates')
    const files: Array<string> = fs.readdirSync(templatesDir)

    this.templates = pipe(
      files,
      map((filename): Template => {
        const parts = filename.split('.')
        const filetype = parts.pop()!
        const name = parts.join('.')
        const filepath = path.join(templatesDir, filename)
        const content = fs.readFileSync(filepath, { encoding: 'utf8' })

        return {
          name,
          filetype,
          content,
        }
      }),
      groupBy((r: Template) => r.name),
      record.map(
        reduce(
          {} as EmailTemplate,
          (acc, { filetype, content }: Template) => {
            const kind = { mjml: 'html', html: 'html', txt: 'text' }[filetype!]

            if (!kind) {
              return acc
            }

            return {
              ...acc,
              [kind]: { filetype, content },
            }
          },
        ),
      ),
    )
  }

  async sendRawEmail(options: EmailTransportOptions) {
    return this.transport.sendEmail(options)
  }

  async sendEmailDirect(options: SendEmailOptions) {
    const html = this.renderTemplate(options.template, 'html', options.payload)
    const text = this.renderTemplate(options.template, 'text', options.payload)

    if (!text) {
      return Promise.reject()
    }

    return this.sendRawEmail({
      to: options.recipient,
      from: 'velat@tko-aly.fi',
      subject: options.subject,
      text,
      html,
    })
  }

  renderTemplate(name: string, type: 'html' | 'text', payload: object) {
    const template = this.templates[name]

    if (!template) {
      return null
    }

    const populate = (template: string) => ejs.render(template, {
      ...payload,
      dateFns,
      formatEuro,
      sumEuroValues,
      euro,
      cents,
      formatDate: (d: number | Date) => dateFns.format(d, 'dd.MM.yyyy'),
    })

    if (type === 'html') {
      if (!template.html)
        return null;

      if (template.html.filetype === 'mjml') {
        return mjml2html(populate(template.html.content)).html
      } else {
        return populate(template.html.content)
      }
    } else {
      if (!template.text)
        return null

      return populate(template.text.content)
    }
  }

  async createEmail(email: NewEmail) {
    const html = this.renderTemplate(email.template, 'html', email.payload)
    const text = this.renderTemplate(email.template, 'text', email.payload)

    const result = await this.pg
      .one<DbEmail>(sql`
        INSERT INTO emails (recipient, subject, template, html, text)
        VALUES (${email.recipient}, ${email.subject}, ${email.template}, ${html}, ${text})
        RETURNING *
     `)

    return result && formatEmail(result)
  }

  async sendEmail(id: string) {
    const email = await this.getEmail(id)

    if (!email) {
      throw 'No such email'
    }

    await this.sendRawEmail({
      to: email.recipient,
      from: 'velat@tko-aly.fi',
      subject: email.subject,
      text: email.text,
      html: email.html,
    })

    await this.pg.any(sql`UPDATE emails SET sent_at = NOW() WHERE id = ${id}`)
  }

  async getEmails() {
    const emails = await this.pg
      .any<DbEmail>(sql`SELECT * FROM emails`)

    return emails.map(formatEmail)
  }

  async getEmail(id: string) {
    const email = await this.pg
      .one<DbEmail>(sql`SELECT * FROM emails WHERE id = ${id}`)

    return email && formatEmail(email)
  }

  async getEmailsByAddress(email: string) {
    const emails = await this.pg
      .any<DbEmail>(sql`SELECT * FROM emails WHERE recipient = ${email}`)

    return emails.map(formatEmail)
  }

  async getEmailsByPayer(payer: InternalIdentity) {
    const emails = await this.pg
      .any<DbEmail>(sql`
        SELECT emails.*
        FROM payer_emails
        JOIN emails ON emails.recipient = payer_emails.email
        WHERE payer_emails.payer_id = ${payer.value}
      `)

    return emails.map(formatEmail)
  }
}
