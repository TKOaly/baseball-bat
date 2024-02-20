import { router } from 'typera-express';
import sql from 'sql-template-strings';
import { ok } from 'typera-express/response';
import { ApiFactory } from '.';

export type ResultRow = {
  type: 'payer' | 'debt' | 'debt_center';
  id: string;
};

const factory: ApiFactory = ({ auth }, route) => {
  const search = route
    .get('/')
    .use(auth.createAuthMiddleware())
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
