import opentelemetry, { SpanStatusCode } from '@opentelemetry/api';
import { Sql, sql } from '@/db/template';
import * as defs from './definitions';
import routes from './api';
import createSubscriber from 'pg-listen';
import { ExecutionContext } from '@/bus';
import { BusContext } from '@/app';
import { createModule } from '@/module';
import { Job, DbJob, internalIdentity } from '@bbat/common/types';
import { createPaginatedQuery } from '@/db/pagination';
import { shutdown } from '@/orchestrator';
import { addSeconds, subMinutes } from 'date-fns';
import { Connection } from '@/db/connection';
import { Session } from '@/middleware/session';

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
  rate: db.rate,
  concurrency: db.concurrency,
  nextPoll: db.next_poll,
  progress: db.progress,
  triggeredBy: db.triggered_by ? internalIdentity(db.triggered_by) : null,
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
      session: Session | null,
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
              session,
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

    const inFlightPeriodicPolls = new Set<Promise<void>>();

    const triggerPoll = async () => {
      if (!running) return;

      const promise = (async () => {
        try {
          await withNewContext(
            'new-job notification handler',
            null,
            async ctx => {
              await ctx.exec(defs.poll);
            },
          );
        } catch (err) {
          logger.error('Job poll failed: ' + err);
        }
      })();

      promise.finally(() => inFlightPeriodicPolls.delete(promise));
      inFlightPeriodicPolls.add(promise);
    };

    const jobQuery = sql`
      SELECT * FROM (SELECT
        *,
        COALESCE(limit_class, type) limit_class,
        COUNT(*) FILTER (WHERE state = 'processing' OR state = 'scheduled') OVER (PARTITION BY COALESCE(limit_class, type)) concurrency,
        COUNT(*) FILTER (WHERE started_at > now() - make_interval(secs => jobs.ratelimit_period)) OVER (PARTITION BY COALESCE(limit_class, type)) rate,
        (CASE
          WHEN ratelimit IS NULL THEN NULL
          ELSE MIN(started_at) FILTER (WHERE started_at > now() - make_interval(secs => jobs.ratelimit_period)) OVER (PARTITION BY COALESCE(limit_class, type)) + make_interval(secs => jobs.ratelimit_period)
        END) next_poll,
        (CASE
          WHEN state = 'succeeded' THEN 1
          WHEN state = 'failed' AND progress IS NULL THEN 0
          WHEN progress IS NOT NULL THEN progress
          ELSE 0
        END) progress
      FROM jobs) s
    `;

    bus.register(defs.poll, async (_, { pg, logger }, bus) => {
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

      const ratelimitPollScheduled = new Set<string>();

      for (const { id } of candidates) {
        const details = await bus.exec(defs.get, id);

        if (!details) {
          throw new Error('Failed to fetch job details!');
        }

        const jobLogger = logger.child({
          job_id: details.id,
          job_type: details.type,
        });

        if (
          details.concurrencyLimit &&
          details.concurrency >= details.concurrencyLimit
        ) {
          jobLogger.info(
            `Skipping job ${details.id} (${details.type}) as limit class '${details.limitClass}' has ${details.concurrency} active jobs, which exceeds the concurrency limit of ${details.concurrencyLimit} for this job.`,
          );
          continue;
        }

        if (details.ratelimit && details.rate >= details.ratelimit) {
          jobLogger.info(
            `Skipping job ${details.id} due to it's ratelimit (${details.ratelimit} runs in ${details.ratelimitPeriod} seconds)`,
          );

          if (!ratelimitPollScheduled.has(details.limitClass)) {
            ratelimitPollScheduled.add(details.limitClass);

            const timeout = details.nextPoll
              ? details.nextPoll.valueOf() - new Date().valueOf()
              : 0;

            setTimeout(() => {
              ratelimitPollScheduled.delete(details.limitClass);
              triggerPoll();
            }, timeout);

            jobLogger.info(
              `Scheduled a poll in ${timeout}ms due to a ratelimit for limit class ${details.limitClass} on job ${id}.`,
            );
          }

          continue;
        }

        await pg.do(sql`
          UPDATE jobs
          SET state = 'scheduled', scheduled_at = ${new Date()}
          WHERE id = ${id}
        `);

        scheduled++;

        jobLogger.info(`Scheduled job ${id}.`);

        const session: Session | null = details.triggeredBy
          ? {
              authLevel: 'authenticated',
              payerId: details.triggeredBy,
              token: '',
            }
          : null;

        const promise = withNewContext('job execution', session, async ctx => {
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

    bus.register(defs.create, async (job, { pg, session }) => {
      const triggeredBy =
        session?.authLevel === 'authenticated' ? session.payerId.value : null;

      const result = await pg.one<{ id: string }>(sql`
        INSERT INTO jobs (type, data, title, max_retries, retry_delay, limit_class, concurrency_limit, ratelimit, ratelimit_period, triggered_by)
        VALUES (
          ${job.type},
          ${job.data},
          ${job.title},
          ${job.retries ?? sql`DEFAULT`},
          ${job.retryDelay ?? sql`DEFAULT`},
          ${job.limitClass},
          ${job.concurrencyLimit},
          ${job.ratelimit},
          ${job.ratelimitPeriod},
          ${triggeredBy}
        )
        RETURNING id
      `);

      if (!result) {
        throw new Error('Failed to create job: ' + job.type);
      }

      return result.id;
    });

    const paginatedQuery = createPaginatedQuery<DbJob>(jobQuery, 'id');

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

      const withSeprateConnection = async (sql: Sql) => {
        const conn = await Connection.create(config.dbUrl);

        try {
          return await conn.do(sql);
        } finally {
          await conn.close();
        }
      };

      await withSeprateConnection(
        sql`UPDATE jobs SET state = 'processing', started_at = ${new Date()} WHERE id = ${id}`,
      );

      logger.info(`Starting job ${id}...`);
      const before = process.hrtime.bigint();
      let after: bigint;

      let error: unknown = null;

      try {
        const result = await iface.execute(job);

        await pg.do(
          sql`UPDATE jobs SET state = 'succeeded', result = ${result}, finished_at = ${new Date()} WHERE id = ${id}`,
        );
      } catch (err) {
        error = err;
      } finally {
        after = process.hrtime.bigint();
        triggerPoll();
      }

      if (error) {
        logger.error(
          `Job ${job.id} (${job.type}) failed after ${formatMicros(after - before)}: ${error}`,
          {
            job_id: job.id,
            job_type: job.type,
          },
        );

        const traceId = opentelemetry.trace
          .getActiveSpan()
          ?.spanContext()?.traceId;

        const result = {
          name: 'Unknown',
          message: `${error}`,
          traceId: traceId ?? null,
        };

        if (error instanceof Error) {
          Object.assign(result, {
            name: `Exception: ${error.name}`,
            message: error.message,
          });
        }

        if (job.retries < job.maxRetries) {
          const timeoutSeconds = job.retryDelay * Math.pow(2, job.retries);
          const delayedUntil = addSeconds(new Date(), timeoutSeconds);

          await withSeprateConnection(sql`
            UPDATE jobs
            SET state = 'pending',
                finished_at = ${new Date()},
                result = ${result},
                delayed_until = ${delayedUntil},
                retries = ${job.retries + 1}
            WHERE id = ${id}
          `);

          setTimeout(triggerPoll, timeoutSeconds * 1000);
        } else {
          await withSeprateConnection(sql`
            UPDATE jobs
            SET state = 'failed',
                finished_at = ${new Date()},
                result = ${result}
            WHERE id = ${id}
          `);
        }

        await pg.rollback();
      } else {
        logger.info(
          `Job ${job.id} (${job.type}) finished in ${formatMicros(after - before)}.`,
          {
            job_id: job.id,
            job_type: job.type,
          },
        );
      }
    });

    bus.register(defs.get, async (id, { pg }) => {
      const result = await pg.one<DbJob>(sql`${jobQuery} WHERE id = ${id}`);

      if (!result) {
        return null;
      }

      return formatJob(result);
    });

    bus.register(defs.update, async ({ id, title, progress }) => {
      const assignments = [];

      if (title !== undefined) {
        assignments.push(sql`title = ${title}`);
      }

      if (progress !== undefined) {
        assignments.push(sql`progress = ${progress}`);
      }

      const conn = await Connection.create(config.dbUrl);

      try {
        await conn.do(sql`
          UPDATE jobs
          SET ${sql`, `.join(assignments)}
          WHERE id = ${id}
        `);
      } finally {
        await conn.close();
      }
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

      logger.debug('Disconnecting PostgreSQL NOTIFY listener...');
      await subscriber.unlistenAll();
      await subscriber.close();

      await Promise.allSettled(inFlightPeriodicPolls);

      logger.info(`Waiting for ${runningJobs.size} jobs to finish...`);
      await Promise.allSettled(runningJobs);
    });
  },
});
