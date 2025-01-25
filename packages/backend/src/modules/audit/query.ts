import { defineQuery } from '@/db/pagination';
import { sql } from '@/db/template';
import { AuditEvent, auditEvent, internalIdentity } from '@bbat/common/types';
import { isLeft } from 'fp-ts/Either';

type AuditLogDb = {
  entry_id: string;
  time: Date;
  type: string;
  subject: string | null;
  details: unknown;
  object_type: string;
  object_id: string;
  links: {
    type: string;
    label: string;
    target_type: string;
    target_id: string;
  }[];
};

const formatAuditLogEntry = (db: AuditLogDb): AuditEvent => {
  const mapped = {
    entryId: db.entry_id,
    time: db.time,
    action: db.type,
    subject: db.subject ? internalIdentity(db.subject) : null,
    details: db.details,
    links: db.links.map(link => ({
      type: link.type,
      label: link.label,
      target: {
        type: link.target_type,
        id: link.target_id,
      },
    })),
  };

  const result = auditEvent.decode(mapped);

  if (isLeft(result)) {
    console.log(mapped);
    throw new Error('Failed to decode auditLogEntry from DB response!');
  }

  return result.right;
};

export const auditQuery = defineQuery({
  paginateBy: 'entry_id',

  map: formatAuditLogEntry,

  query: sql`
    SELECT
      e.*,
      (SELECT ARRAY_AGG(TO_JSON(l.*)) FROM audit_log_link l WHERE l.entry_id = e.entry_id) AS links
    FROM audit_log e
  `,
});
