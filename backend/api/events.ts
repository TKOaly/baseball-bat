import { Parser, Router, route, router } from 'typera-express'
import { ok } from 'typera-express/response'
import { EventsService } from '../services/events'
import { nonEmptyArray, tkoalyIdentity, internalIdentity } from '../../common/types'
import { AuthService } from '../auth-middleware'
import { PayerService } from '../services/payer'
import * as t from 'io-ts'
import { Service, Inject } from 'typedi'
import * as dfn from 'date-fns'

@Service()
export class EventsApi {
  @Inject(() => EventsService)
  eventsService: EventsService

  @Inject(() => PayerService)
  payerService: PayerService

  @Inject(() => AuthService)
  authService: AuthService

  getEvents() {
    return route
      .get('/')
      .use(this.authService.createAuthMiddleware())
      .handler(async ({ session }) => {
        const payerProfile = await this.payerService.getPayerProfileByInternalIdentity(internalIdentity(session.payerId))

        if (!payerProfile || !payerProfile.tkoalyUserId) {
          return ok([])
        }

        const events = await this.eventsService.getEvents(payerProfile.tkoalyUserId)

        const withStatus = await this.payerService.getEventsWithPaymentStatus(
          payerProfile.id,
          events
        )

        return ok(withStatus)
      })
  }

  payEvents() {
    return route
      .post('/pay')
      .use(this.authService.createAuthMiddleware())
      .use(Parser.body(PayEventsBody))
      .handler(async ({ body, session }) => {
        await this.payerService.payUsersEvents(
          body.events,
          internalIdentity(session.payerId)
        )

        return ok({ ok: true })
      })
  }

  getEventRegistrations() {
    return route
      .get('/:id(int)/registrations')
      .use(this.authService.createAuthMiddleware())
      .handler(async (ctx) => {
        const registrations = await this.eventsService.getEventRegistrations(ctx.routeParams.id);
        return ok(registrations);
      })
  }

  getEventCustomFields() {
    return route
      .get('/:id(int)/fields')
      .use(this.authService.createAuthMiddleware())
      .handler(async (ctx) => {
        const fields = await this.eventsService.getEventCustomFields(ctx.routeParams.id);
        return ok(fields);
      })
  }

  getAllEvents() {
    return route
      .get('/all')
      .use(this.authService.createAuthMiddleware())
      .handler(async (ctx) => {
        const events = await this.eventsService.getAllEvents({
          starting: typeof ctx.req.query.starting === 'string'
            ? new Date(ctx.req.query.starting)
            : dfn.subMonths(new Date(), 1),
        });

        return ok(events);
      })
  }

  router(): Router {
    return router(
      this.getEvents(),
      this.payEvents(),
      this.getEventRegistrations(),
      this.getEventCustomFields(),
      this.getAllEvents()
    )
  }
}

const PayEventsBody = t.type({
  events: nonEmptyArray(t.number),
})
