import { defineQuery } from '@/db/pagination';
import { sql } from '@/db/template';
import { DbJob, Job, internalIdentity } from '@bbat/common/types';

export const formatJob = (db: DbJob): Job => ({
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
  lockId: db.lock_id,
});

export const jobQuery = defineQuery({
  paginateBy: 'id',

  map: formatJob,

  query: sql`
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
  `,
});
