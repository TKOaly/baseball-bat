import { defineQuery } from '@/db/pagination';
import { sql } from '@/db/template';
import { DbEmail, Email } from '@bbat/common/types';

export const formatEmail = (email: DbEmail): Email => ({
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

export const emailQuery = defineQuery({
  paginateBy: 'id',

  map: formatEmail,

  query: sql`SELECT * FROM emails`,
});
