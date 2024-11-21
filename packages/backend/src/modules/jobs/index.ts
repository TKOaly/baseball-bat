import opentelemetry, { SpanStatusCode } from '@opentelemetry/api';
import sql from 'sql-template-strings';
import * as defs from './definitions';
import routes from './api';
import createSubscriber from 'pg-listen';
import { ExecutionContext } from '@/bus';
import { BusContext } from '@/app';
import { createModule } from '@/module';
import { Job, DbJob } from '@bbat/common/types';
import { createPaginatedQuery } from '@/db/pagination';

const formatJob = (db: DbJob): Job => ({
  id: db.id,
  type: db.type,
  title: db.title ?? null,
  state: db.state,
  createdAt: db.created_at,
  startedAt: db.started_at ?? null,
  finishedAt: db.finished_at ?? null,
  data: db.data,
  result: db.result,
});

export default createModule({
  name: 'jobs',

  routes,

  async setup({ config, pool, logger, bus, nats }) {
    const subscriber = createSubscriber({
      connectionString: config.dbUrl,
    });

    const withNewContext = <T>(
      span: string,
      cb: (ctx: ExecutionContext<BusContext>) => Promise<T>,
    ): Promise<T> => {
      return pool.withConnection(async pg => {
        const tracer = opentelemetry.trace.getTracer('baseball-bat');

        return await tracer.startActiveSpan(
          span,
          { root: true },
          async span => {
            const context = bus.createContext({
              pg,
              nats,
              session: null,
              span,
              logger,
            });

            try {
              return await cb(context);
            } catch (err) {
              if (err instanceof Error) {
                span.recordException(err);
              }

              span.setStatus({
                code: SpanStatusCode.ERROR,
                message: String(err),
              });

              throw err;
            } finally {
              span.end();
            }
          },
        );
      });
    };

    bus.register(defs.poll, async (_, { pg, logger }) => {
      const jobs = await pg.many<{ id: string }>(sql`
        UPDATE jobs
        SET state = 'scheduled'
        FROM (
          SELECT id
          FROM jobs
          WHERE state = 'pending'
          FOR UPDATE SKIP LOCKED
        ) pending
        WHERE jobs.id = pending.id
        RETURNING jobs.id
      `);

      if (jobs.length > 0) {
        logger.info(`Dispatching ${jobs.length} jobs...`);
      }

      jobs.map(({ id }) =>
        withNewContext('job execution', async ctx => {
          try {
            await ctx.exec(defs.execute, id);
          } catch (err) {
            ctx.context.logger.error(`Job ${id} failed: ${err}`, {
              job_id: id,
            });

            await pool.withConnection(async conn => {
              await conn.do(
                sql`UPDATE jobs SET state = 'failed', finished_at = NOW() WHERE id = ${id}`,
              );
            });

            throw err;
          }
        }),
      );
    });

    bus.register(defs.create, async (job, { pg }) => {
      const result = await pg.one<{ id: string }>(
        sql`INSERT INTO jobs (type, data, title) VALUES (${job.type}, ${job.data}, ${job.title}) RETURNING id`,
      );

      if (!result) {
        throw new Error('Failed to create job: ' + job.type);
      }

      return result.id;
    });

    const paginatedQuery = createPaginatedQuery<DbJob>(
      sql`SELECT * FROM jobs`,
      'id',
    );

    bus.register(defs.list, async ({ limit, cursor, sort }, { pg }) => {
      return paginatedQuery(pg, {
        limit,
        cursor,
        order: sort
          ? [[sort.column, sort.dir] as [string, 'asc' | 'desc']]
          : undefined,
        map: formatJob,
      });
    });

    bus.register(defs.execute, async (id, { pg, logger }, bus) => {
      const job = await bus.exec(defs.get, id);

      if (!job) {
        logger.warn(`No job with ID '${id}' found!`);
        return;
      }

      const iface = bus.getInterface(defs.executor, job.type);

      try {
        await pool.withConnection(async conn => {
          await conn.do(
            sql`UPDATE jobs SET state = 'processing', started_at = ${new Date()} WHERE id = ${id}`,
          );
        });

        const result = await iface.execute(job);
        await pg.do(
          sql`UPDATE jobs SET state = 'succeeded', result = ${result}, finished_at = ${new Date()} WHERE id = ${id}`,
        );
      } catch (err) {
        logger.error(`Job ${job.id} (${job.type}) failed: ${err}`, {
          job_id: job.id,
          job_type: job.type,
        });

        const traceId = opentelemetry.trace
          .getActiveSpan()
          ?.spanContext()?.traceId;

        const error = {
          name: 'Unknown',
          message: `${err}`,
          traceId: traceId ?? null,
        };

        if (err instanceof Error) {
          Object.assign(error, {
            name: `Exception: ${err.name}`,
            message: err.message,
          });
        }

        await pool.withConnection(async conn => {
          await conn.do(
            sql`UPDATE jobs SET state = 'failed', finished_at = ${new Date()}, result = ${error} WHERE id = ${id}`,
          );
        });
      }
    });

    bus.register(defs.get, async (id, { pg }) => {
      const result = await pg.one<DbJob>(
        sql`SELECT * FROM jobs WHERE id = ${id}`,
      );

      if (!result) {
        return null;
      }

      return formatJob(result);
    });

    subscriber.notifications.on('new-job', ({ id }) => {
      try {
        withNewContext('new-job notification handler', async ctx => {
          logger.info(`Got notification about job ${id}!`);
          await ctx.exec(defs.poll);
        });
      } catch (err) {
        console.error(err);
      }
    });

    await subscriber.connect();
    await subscriber.listenTo('new-job');

    setInterval(() => {
      withNewContext('periodic job poll', ctx => ctx.exec(defs.poll));
    }, 10_000);
  },
});
