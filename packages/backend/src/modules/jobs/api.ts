import { Parser, router } from 'typera-express';
import { internalServerError, notFound, ok } from 'typera-express/response';
import auth from '@/auth-middleware';
import * as defs from './definitions';
import { RouterFactory } from '@/module';
import { paginationQuery } from '@bbat/common/types';

const factory: RouterFactory = route => {
  const getJobs = route
    .get('/list')
    .use(Parser.query(paginationQuery))
    .handler(async ({ bus, query }) => {
      const result = await bus.exec(defs.list, query);
      return ok(result);
    });

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
    .handler(async () => {
      return internalServerError('Not implemented.');
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
