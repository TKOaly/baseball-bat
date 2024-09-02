import { createModule } from '@/module';
import sql from 'sql-template-strings';
import iface from './definitions';
import routes from './api';
import * as A from 'fp-ts/Array';
import * as T from 'fp-ts/Task';
import { pipe } from 'fp-ts/function';
import { createPaginatedQuery } from '@/db/pagination';
import { AuditEvent, auditEvent, internalIdentity } from '@bbat/common/types';
import { isLeft } from 'fp-ts/lib/Either';

const query = createPaginatedQuery<AuditLogDb>(
  sql`
  SELECT
    e.*,
    (SELECT ARRAY_AGG(TO_JSON(l.*)) FROM audit_log_link l WHERE l.entry_id = e.entry_id) AS links
  FROM audit_log e
`,
  'entry_id',
);

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
    /*object: {
      type: db.object_type,
      id: db.object_id,
    },*/
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

export default createModule({
  name: 'audit',

  routes,

  async setup({ bus }) {
    bus.provide(iface, {
      async logEvent({ type, details, links }, { pg, session }) {
        const subject =
          session?.authLevel === 'authenticated' ? session.payerId.value : null;

        const result = await pg.one<{ entry_id: string }>(sql`
          INSERT INTO audit_log (type, subject, details) VALUES (${type}, ${subject}, ${details})
          RETURNING entry_id;
        `);

        if (!result) {
          throw new Error('Failed to write to the audit log!');
        }

        if (links) {
          await pipe(
            links,
            A.traverse(T.ApplicativePar)(
              link => () =>
                pg.do(sql`
                INSERT INTO audit_log_link (entry_id, type, target_type, target_id, label)
                VALUES (${result.entry_id}, ${link.type}, ${link.target.type}, ${link.target.id}, ${link.label})
              `),
            ),
          )();
        }
      },

      async getLogEvents({ sort, ...options }, { pg }) {
        return query(pg, {
          ...options,
          order: sort ? [[sort.column, sort.dir]] : undefined,
          map: formatAuditLogEntry,
        });
      },
    });
  },
});
