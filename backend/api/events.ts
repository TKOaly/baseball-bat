import { route } from 'typera-express'
import { ok } from 'typera-express/response'
import { EventsService } from '../services/events'
import { tkoAlyUserId } from '../../common/types'

export default (eventService: EventsService) => {
  return route
    .get('/events')
    .handler(async () => ok(await eventService.getEvents(tkoAlyUserId(1078))))
}
