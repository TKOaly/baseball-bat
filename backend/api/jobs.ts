import { JobNode } from "bullmq";
import { Inject, Service } from "typedi";
import { route, router } from "typera-express";
import { notFound, ok } from "typera-express/response";
import { AuthService } from "../auth-middleware";
import { JobService } from "../services/jobs";

const formatJob = async (node: JobNode): Promise<any> => {
  const children = await Promise.all((node.children ?? []).map(formatJob));

  let status = await node.job.getState();

  if (children.some(c => c.status === 'failed')) {
    status = 'failed';
  } else if (status === 'completed' && node.job.returnvalue.result === 'error') {
    status = 'failed';
  }

  return {
    name: node.job.data.name ?? node.job.name,
    id: node.job.id,
    status,
    time: node.job.timestamp,
    processedAt: node.job.processedOn,
    finishedAt: node.job.finishedOn,
    duration: (children.length > 0 ? children.map(c => c.duration).reduce((a, b) => a + b) : 0)
      + (node.job.finishedOn ?? 0) - (node.job.processedOn ?? 0),
    children,
    queue: node.job.queueName,
    returnvalue: node.job.returnvalue,
    progress: children.length > 0
      ? (children.map((job) => job.progress).reduce((a, b) => a + b, 0) / children.length)
      : (['completed', 'failed'].indexOf(status) === -1 ? 0 : 1),
  };
};


@Service()
export class JobsApi {
  @Inject(() => JobService)
  jobService: JobService;

  @Inject(() => AuthService)
  authService: AuthService;

  private getJobs() {
    return route
      .get('/list')
      .use(this.authService.createAuthMiddleware())
      .handler(async (_ctx) => {
        const jobs = await this.jobService.getJobs();

        return ok(await Promise.all(jobs.map(formatJob)));
      })
  }

  private getJob() {
    return route
      .get('/queue/:queue/:id')
      .use(this.authService.createAuthMiddleware())
      .handler(async (ctx) => {
        const node = await this.jobService.getJob(ctx.routeParams.queue, ctx.routeParams.id);

        if (!node) {
          return notFound();
        }

        return ok(await formatJob(node));
      })
  }

  private retryJob() {
    return route
      .post('/queue/:queue/:id/retry')
      .use(this.authService.createAuthMiddleware())
      .handler(async (ctx) => {
        const node = await this.jobService.getJob(ctx.routeParams.queue, ctx.routeParams.id);

        if (!node) {
          return notFound();
        }

        await node.job.retry('failed');

        return ok();
      });
  }

  router() {
    return router(
      this.getJobs(),
      this.getJob(),
      this.retryJob(),
    );
  }
}
