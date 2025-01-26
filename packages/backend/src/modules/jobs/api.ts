import { router } from 'typera-express';
import { notFound, ok } from 'typera-express/response';
import auth from '@/auth-middleware';
import * as defs from './definitions';
import { RouterFactory } from '@/module';
import { jobQuery } from './query';

const factory: RouterFactory = route => {
  const getJobs = route
    .use(auth())
    .get('/list')
    .use(jobQuery.middleware())
    .handler(jobQuery.handler());

  const getJob = route
    .get('/:id')
    .use(auth())
    .handler(async ({ routeParams, bus }) => {
      const result = await bus.exec(defs.get, routeParams.id);

      if (!result) {
        return notFound();
      }

      return ok(result);
    });

  const retryJob = route
    .post('/:id/retry')
    .use(auth())
    .handler(async ({ routeParams, bus }) => {
      await bus.exec(defs.retry, routeParams.id);

      return ok();
    });

  const terminateJob = route
    .post('/:id/terminate')
    .use(auth())
    .handler(async ({ routeParams, bus }) => {
      const result = await bus.exec(defs.terminate, routeParams.id);
      return ok(result);
    });

  return router(getJobs, getJob, retryJob, terminateJob);
};

export default factory;
