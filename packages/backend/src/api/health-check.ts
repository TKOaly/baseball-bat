import { router } from 'typera-express';
import { internalServerError, ok } from 'typera-express/response';
import { ApiFactory } from '.';
import { sql } from '@/db/template';

const factory: ApiFactory = ({ config }, route) => {
  const check = route.get('/').handler(async ({ pg, redis, minio, logger }) => {
    const statuses = {
      db: true,
      redis: true,
      minio: true,
    };

    try {
      await pg.do(sql`SELECT 1`);
    } catch (err) {
      logger.error(
        { err, component: 'postgres' },
        'PostgreSQL failed during health check',
      );
      statuses.db = false;
    }

    try {
      await redis.set('healthcheck', 'test');
    } catch (err) {
      logger.error(
        { err, component: 'redis' },
        'Redis failed during health check',
      );
      statuses.redis = false;
    }

    try {
      await minio.bucketExists(config.minioBucket);
    } catch (err) {
      logger.error(
        { err, component: 'minio' },
        'MinIO failed during health check',
      );
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
