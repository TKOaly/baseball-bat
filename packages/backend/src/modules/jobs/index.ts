import opentelemetry, { SpanStatusCode } from '@opentelemetry/api';
import { sql } from '@/db/template';
import * as defs from './definitions';
import routes from './api';
import createSubscriber from 'pg-listen';
import { ExecutionContext } from '@/bus';
import { BusContext } from '@/app';
import { createModule } from '@/module';
import { Job, DbJob } from '@bbat/common/types';
import { createPaginatedQuery } from '@/db/pagination';
import { shutdown } from '@/orchestrator';
import { addSeconds, subMinutes } from 'date-fns';
import { Connection } from '@/db/connection';

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
  delayedUntil: db.delayed_until ?? null,
  retries: db.retries,
  maxRetries: db.max_retries,
  retryDelay: db.retry_delay,
  limitClass: db.limit_class ?? db.type,
  concurrencyLimit: db.concurrency_limit ?? null,
  ratelimit: db.ratelimit ?? null,
  ratelimitPeriod: db.ratelimit_period ?? null,
});

const formatMicros = (ms: bigint) => {
  if (ms > 60_000_000_000) {
    const units = ['s', 'm', 'h'];
    const seconds = Number(ms / 1_000_000_000n);
    let scale = 0;
    while (seconds >= Math.pow(60, scale) && scale < units.length) scale++;
    const parts = [];
    let reminder = seconds;
    for (let i = scale - 1; i >= 0; i--) {
      const wholes = Math.floor(reminder / Math.pow(60, i));
      reminder = reminder % Math.pow(60, i);
      parts.push(`${wholes}${units[i]}`);
    }

    return parts.join(' ');
  }

  const units = ['μs', 'ns', 'ms', 's'];
  let scale = 0;
  while (ms >= Math.pow(1000, scale) && scale < units.length) scale++;
  return `${(Number(ms) / Math.pow(1000, scale - 1)).toFixed(2)}${units[Math.min(units.length - 1, scale - 1)]}`;
};

export default createModule({
  name: 'jobs',

  routes,

  async setup({ config, pool, logger, bus, nats }) {
    const subscriber = createSubscriber({
      connectionString: config.dbUrl,
    });

    const runningJobs = new Set<Promise<void>>();

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

    const triggerPoll = async () => {
      if (!running) return;

      try {
        await withNewContext('new-job notification handler', async ctx => {
          await ctx.exec(defs.poll);
        });
      } catch (err) {
        logger.error('Job poll failed: ' + err);
      }
    };

    bus.register(defs.poll, async (_, { pg, logger }) => {
      if (!running) return;

      // Try to acquire an advisory lock no. 1, which is used to ensure that
      // only one poll is running at a time. The lock numbers are arbitrary
      // and application-defined. We'll just use 1 here, because this is the
      // only lock we use.
      const result = await pg.one<{ acquired: boolean }>(
        sql`SELECT pg_try_advisory_xact_lock(1) acquired`,
      );

      if (!result || !result.acquired) {
        logger.info('Another poll already in progress.');
        return;
      }

      // If no other polls are in progress, we'll continue by locking the table
      // to prevent any concurrent writes. Concurrent reads continue to be
      // allowed. Note that, unlike for the previous lock, we wait for this lock.
      await pg.do(sql`LOCK TABLE jobs IN EXCLUSIVE MODE`);

      const candidates = await pg.many<{ id: string }>(sql`
        SELECT id
        FROM jobs
        WHERE state = 'pending'
          AND (delayed_until IS NULL OR delayed_until < NOW())
        ORDER BY created_at ASC
      `);

      if (!running) return;

      let scheduled = 0;

      for (const { id } of candidates) {
        const details = await pg.one<
          DbJob & { concurrency: number; recent_run_count: number }
        >(sql`
          SELECT * FROM (
            SELECT
              *,
              COALESCE(limit_class, type) limit_class,
              COUNT(*) FILTER (WHERE state = 'processing' OR state = 'scheduled') OVER (PARTITION BY COALESCE(limit_class, type)) concurrency,
              COUNT(*) FILTER (WHERE started_at > now() - make_interval(secs => jobs.ratelimit_period)) OVER (PARTITION BY COALESCE(limit_class, type)) recent_run_count
            FROM jobs
          ) s
          WHERE id = ${id}
        `);

        if (!details) {
          throw new Error('Failed to fetch job details!');
        }

        const jobLogger = logger.child({
          job_id: details.id,
          job_type: details.type,
        });

        if (
          details.concurrency_limit &&
          details.concurrency >= details.concurrency_limit
        ) {
          jobLogger.info(
            `Skipping job ${details.id} (${details.type}) as limit class '${details.limit_class}' has ${details.concurrency} active jobs, which exceeds the concurrency limit of ${details.concurrency_limit} for this job.`,
          );
          continue;
        }

        if (
          details.ratelimit &&
          details.recent_run_count >= details.ratelimit
        ) {
          jobLogger.info(
            `Skipping job ${details.id} due to it's ratelimit (${details.ratelimit} runs in ${details.ratelimit_period} seconds)`,
          );
          continue;
        }

        await pg.do(sql`
          UPDATE jobs
          SET state = 'scheduled', scheduled_at = ${new Date()}
          WHERE id = ${id}
        `);

        scheduled++;

        jobLogger.info(`Scheduled job ${id}.`);

        const promise = withNewContext('job execution', async ctx => {
          try {
            jobLogger.info(`Starting job ${id}...`);
            const before = process.hrtime.bigint();
            await ctx.exec(defs.execute, id);
            const after = process.hrtime.bigint();
            jobLogger.info(
              `Job ${id} done in ${formatMicros(after - before)}!`,
            );
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
        });

        promise.finally(() => runningJobs.delete(promise));
        runningJobs.add(promise);
      }

      if (candidates.length > 0) {
        logger.info(
          `Scheduled ${scheduled} out of ${candidates.length} candidates.`,
        );
      }

      const zombies = await pg.many<{ id: string }>(sql`
        UPDATE jobs
        SET state = 'pending'
        WHERE state = 'scheduled' AND scheduled_at < ${subMinutes(new Date(), 5)} 
        RETURNING id
      `);

      if (zombies.length > 0) {
        logger.info(
          `Returned ${zombies.length} scheduled jobs to the pending state.`,
        );
      }
    });

    bus.register(defs.create, async (job, { pg }) => {
      const result = await pg.one<{ id: string }>(sql`
        INSERT INTO jobs (type, data, title, max_retries, retry_delay, limit_class, concurrency_limit, ratelimit, ratelimit_period)
        VALUES (
          ${job.type},
          ${job.data},
          ${job.title},
          ${job.retries ?? sql`DEFAULT`},
          ${job.retryDelay ?? sql`DEFAULT`},
          ${job.limitClass},
          ${job.concurrencyLimit},
          ${job.ratelimit},
          ${job.ratelimitPeriod}
        )
        RETURNING id
      `);

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
      if (!running) return;

      const job = await bus.exec(defs.get, id);

      if (!job) {
        logger.warn(`No job with ID '${id}' found!`);
        return;
      }

      const iface = bus.getInterface(defs.executor, job.type);

      try {
        const conn = await Connection.create(config.dbUrl);

        try {
          await conn.do(
            sql`UPDATE jobs SET state = 'processing', started_at = ${new Date()} WHERE id = ${id}`,
          );
        } finally {
          await conn.close();
        }

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

        if (job.retries < job.maxRetries) {
          const timeoutSeconds = job.retryDelay * Math.pow(2, job.retries);
          const delayedUntil = addSeconds(new Date(), timeoutSeconds);

          await pg.do(sql`
            UPDATE jobs
            SET state = 'pending',
                finished_at = ${new Date()},
                result = ${error},
                delayed_until = ${delayedUntil},
                retries = ${job.retries + 1}
            WHERE id = ${id}
          `);

          setTimeout(triggerPoll, timeoutSeconds * 1000);
        } else {
          await pg.do(sql`
            UPDATE jobs
            SET state = 'failed',
                finished_at = ${new Date()},
                result = ${error}
            WHERE id = ${id}
          `);
        }
      } finally {
        triggerPoll();
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

    subscriber.notifications.on('new-job', async ({ id }) => {
      logger.info(`Got notification about job ${id}!`);
      await triggerPoll();
    });

    await subscriber.connect();
    await subscriber.listenTo('new-job');

    const interval = setInterval(triggerPoll, 10_000);

    let running = true;

    triggerPoll();

    bus.on(shutdown, async () => {
      running = false;

      clearInterval(interval);

      await subscriber.unlistenAll();
      await subscriber.close();

      logger.info(`Waiting for ${runningJobs.size} jobs to finish...`);
      await Promise.all(runningJobs);
    });
  },
});
