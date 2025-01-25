import { RouterFactory } from '@/module';
import auth from '@/auth-middleware';
import { router } from 'typera-express';
import { auditQuery } from './query';

const factory: RouterFactory = route => {
  const getAuditLogEvents = route
    .use(auth())
    .use(auditQuery.middleware())
    .get('/events')
    .handler(auditQuery.handler());

  return router(getAuditLogEvents);
};

export default factory;
