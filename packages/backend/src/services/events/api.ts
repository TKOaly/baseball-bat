import { router } from 'typera-express';
import { ok } from 'typera-express/response';
import * as eventsService from '@/services/events/definitions';
import auth from '@/auth-middleware';
import * as dfn from 'date-fns';
import { RouterFactory } from '@/module';

const factory: RouterFactory = route => {
  const getEventRegistrations = route
    .get('/:id(int)/registrations')
    .use(auth())
    .handler(async ({ bus, ...ctx }) => {
      const registrations = await bus.exec(
        eventsService.getEventRegistrations,
        ctx.routeParams.id,
      );
      return ok(registrations);
    });

  const getEventCustomFields = route
    .get('/:id(int)/fields')
    .use(auth())
    .handler(async ({ bus, ...ctx }) => {
      const fields = await bus.exec(
        eventsService.getEventCustomFields,
        ctx.routeParams.id,
      );
      return ok(fields);
    });

  const getAllEvents = route
    .get('/all')
    .use(auth())
    .handler(async ({ bus, ...ctx }) => {
      const events = await bus.exec(eventsService.getEvents, {
        starting:
          typeof ctx.req.query.starting === 'string'
            ? new Date(ctx.req.query.starting)
            : dfn.subMonths(new Date(), 1),
      });

      return ok(events);
    });

  return router(getEventRegistrations, getEventCustomFields, getAllEvents);
};

export default factory;
