import { route, router } from 'typera-express';
import sql from 'sql-template-strings';
import { PgClient } from '../db';
import { AuthService } from '../auth-middleware';
import { Inject, Service } from 'typedi';
import { ok } from 'typera-express/response';

export type ResultRow = {
  type: 'payer' | 'debt' | 'debt_center'
  id: string
}

@Service()
export class SearchApi {
  @Inject(() => PgClient)
    pg: PgClient;

  @Inject(() => AuthService)
    authService: AuthService;

  private search() {
    return route
      .get('/')
      .use(this.authService.createAuthMiddleware())
      .handler(async (ctx) => {
        const { term, type } = ctx.req.query;

        const results = await this.pg.any<ResultRow>(sql`
          SELECT *
          FROM resource_ts rts
          WHERE ${term} <% rts.text AND (${type === undefined} OR rts.type = ${type})
          ORDER BY (${term} <<-> rts.text) + ((${term} <<-> rts.name) * 1.5)
          LIMIT 50
        `);

        return ok(results);
      });
  }

  router() {
    return router(
      this.search(),
    );
  }
}
