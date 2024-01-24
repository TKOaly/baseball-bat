import { route, router } from 'typera-express';
import sql from 'sql-template-strings';
import { PgClient } from '../db';
import { AuthService } from '../auth-middleware';
import { Inject, Service } from 'typedi';
import { ok } from 'typera-express/response';
import { ApiDeps } from '.';

export type ResultRow = {
  type: 'payer' | 'debt' | 'debt_center';
  id: string;
};

export default ({ pg, auth }: ApiDeps) => {
  const search = route
    .get('/')
    .use(auth.createAuthMiddleware())
    .handler(async ctx => {
      const { term, type } = ctx.req.query;

      const results = await pg.any<ResultRow>(sql`
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
