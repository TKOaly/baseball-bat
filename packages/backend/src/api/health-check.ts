import { route, router } from 'typera-express';
import { internalServerError, ok } from 'typera-express/response';
import { ApiFactory } from '.';
import sql from 'sql-template-strings';

const factory: ApiFactory = ({ config }, route) => {
  const check = route
    .get('/')
    .handler(async ({ pg, redis, minio }) => {
      const statuses = {
        db: true,
        redis: true,
        minio: true,
      };

      try {
        await pg.do(sql`SELECT 1`);
      } catch (err) {
        console.log('PostgreSQL failed during health check:', err);
        statuses.db = false;
      }

      try {
        await redis.set('healthcheck', 'test');
      } catch (err) {
        console.log('Redis failed during health check:', err);
        statuses.redis = false;
      }

      try {
        await minio.bucketExists(config.minioBucket);
      } catch (err) {
        console.log('MinIO failed during health check:', err);
        statuses.minio = false;
      }

      if (Object.values(statuses).includes(false)) {
        return internalServerError({
          statuses,
        });
      }

      return ok({ statuses });
    });

  return router(check);
};

export default factory;
