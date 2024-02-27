import { JobNode } from 'bullmq';
import { router } from 'typera-express';
import { notFound, ok } from 'typera-express/response';
import { Job } from '@bbat/common/src/types';
import { ApiFactory } from '.';

const formatJob = async (node: JobNode): Promise<Job> => {
  const children = await Promise.all((node.children ?? []).map(formatJob));

  let status = (await node.job.getState()) ?? 'unknown';

  if (children.some(c => c.status === 'failed')) {
    status = 'failed';
  } else if (
    status === 'completed' &&
    node.job.returnvalue?.result === 'error'
  ) {
    status = 'failed';
  }

  if (!node.job.id) {
    throw new Error('Job should have an ID!');
  }

  return {
    name: node.job.data.name ?? node.job.name,
    id: node.job.id,
    status,
    time: new Date(node.job.timestamp),
    processedAt: node.job.processedOn ? new Date(node.job.processedOn) : null,
    finishedAt: node.job.finishedOn ? new Date(node.job.finishedOn) : null,
    duration:
      (children.length > 0
        ? children.map(c => c.duration).reduce((a, b) => a + b)
        : 0) +
      (node.job.finishedOn ?? 0) -
      (node.job.processedOn ?? 0),
    children,
    queue: node.job.queueName,
    returnValue: node.job.returnvalue,
    progress:
      children.length > 0
        ? children.map(job => job.progress).reduce((a, b) => a + b, 0) /
          children.length
        : ['completed', 'failed'].indexOf(status) === -1
          ? 0
          : 1,
  };
};

const factory: ApiFactory = ({ jobs, auth }, route) => {
  const getJobs = route
    .get('/list')
    .use(auth.createAuthMiddleware())
    .handler(async _ctx => {
      const allJobs = await jobs.getJobs();

      return ok(await Promise.all(allJobs.map(formatJob)));
    });

  const getJob = route
    .get('/queue/:queue/:id')
    .use(auth.createAuthMiddleware())
    .handler(async ctx => {
      const node = await jobs.getJob(ctx.routeParams.queue, ctx.routeParams.id);

      if (!node) {
        return notFound();
      }

      return ok(await formatJob(node));
    });

  const retryJob = route
    .post('/queue/:queue/:id/retry')
    .use(auth.createAuthMiddleware())
    .handler(async ctx => {
      const node = await jobs.getJob(ctx.routeParams.queue, ctx.routeParams.id);

      if (!node) {
        return notFound();
      }

      await node.job.retry('failed');

      return ok();
    });

  return router(getJobs, getJob, retryJob);
};

export default factory;
