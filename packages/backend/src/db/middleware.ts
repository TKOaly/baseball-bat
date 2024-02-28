import { Middleware } from 'typera-express';
import { Connection, Pool } from './connection';

export type DatabaseMiddleware = Middleware.Middleware<
  { pg: Connection },
  never
>;

export default (pool: Pool): DatabaseMiddleware => {
  return async ({ res }) => {
    const pg = await pool.connect();

    res.on('finish', async () => {
      if (res.statusCode !== 500) {
        await pg.commit();
      } else {
        await pg.rollback();
      }

      await pg.close();
    });

    return Middleware.next({ pg });
  };
};
