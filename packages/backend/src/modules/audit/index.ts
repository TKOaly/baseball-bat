import { createModule } from '@/module';
import { sql } from '@/db/template';
import iface from './definitions';
import routes from './api';
import * as A from 'fp-ts/Array';
import * as T from 'fp-ts/Task';
import { pipe } from 'fp-ts/function';
import { auditQuery } from './query';

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
        return auditQuery.execute(pg, {
          ...options,
          order: sort ? [[sort.column, sort.dir]] : undefined,
        });
      },
    });
  },
});
