import { route, router } from 'typera-express';
import { ok } from 'typera-express/response';
import * as eventsService from '@/services/events/definitions';
import * as dfn from 'date-fns';
import { ApiDeps } from '.';

export default ({ auth, bus }: ApiDeps) => {
  /*getEvents() {
    return route
      .get('/')
      .use(this.authService.createAuthMiddleware())
      .handler(async ({ session }) => {
        const payerProfile = await this.payerService.getPayerProfileByInternalIdentity(internalIdentity(session.payerId));

        if (!payerProfile || !payerProfile.tkoalyUserId) {
          return ok([]);
        }

        const events = await this.eventsService.getEvents(payerProfile.tkoalyUserId);

        const withStatus = await this.payerService.getEventsWithPaymentStatus(
          payerProfile.id,
          events,
        );

        return ok(withStatus);
      });
  }*/

  const getEventRegistrations = route
    .get('/:id(int)/registrations')
    .use(auth.createAuthMiddleware())
    .handler(async ctx => {
      const registrations = await bus.exec(
        eventsService.getEventRegistrations,
        ctx.routeParams.id,
      );
      return ok(registrations);
    });

  const getEventCustomFields = route
    .get('/:id(int)/fields')
    .use(auth.createAuthMiddleware())
    .handler(async ctx => {
      const fields = await bus.exec(
        eventsService.getEventCustomFields,
        ctx.routeParams.id,
      );
      return ok(fields);
    });

  const getAllEvents = route
    .get('/all')
    .use(auth.createAuthMiddleware())
    .handler(async ctx => {
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
