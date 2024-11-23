import { router } from 'typera-express';
import { sql } from '@/db/template';
import { ok } from 'typera-express/response';
import auth from '@/auth-middleware';
import { RouterFactory } from '@/module';

export type ResultRow = {
  type: 'payer' | 'debt' | 'debt_center';
  id: string;
};

const factory: RouterFactory = route => {
  const search = route
    .get('/')
    .use(auth())
    .handler(async ({ pg, ...ctx }) => {
      const { term, type } = ctx.req.query;

      const results = await pg.many<ResultRow>(sql`
          SELECT *
          FROM resource_ts rts
          WHERE ${term} <% rts.text AND (${
            type === undefined
          } OR rts.type = ${type})
          ORDER BY (${term} <<-> rts.text) + ((${term} <<-> rts.name) * 1.5)
          LIMIT 50
        `);

      return ok(results);
    });

  return router(search);
};

export default factory;
