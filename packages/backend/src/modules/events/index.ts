import axios from 'axios';
import iface from './definitions';
import routes from './api';
import {
  ApiCustomField,
  ApiEvent,
  ApiRegistration,
  euro,
  EuroValue,
  Event,
  numberFromString,
  Registration,
  tkoalyIdentity,
} from '@bbat/common/types';
import { parseISO } from 'date-fns';
import * as Either from 'fp-ts/Either';
import { pipe } from 'fp-ts/function';
import { createModule } from '@/module';

const getEuro = (value: string): EuroValue | undefined =>
  pipe(
    value.replace('€', '').trim(),
    numberFromString.decode,
    Either.fold(() => undefined, euro),
  );

const parseApiEvent = (apiEvent: ApiEvent): Event => ({
  id: apiEvent.id,
  name: apiEvent.name,
  starts: parseISO(apiEvent.starts),
  registrationStarts: parseISO(apiEvent.registration_starts),
  registrationEnds: parseISO(apiEvent.registration_ends),
  cancellationStarts: parseISO(apiEvent.cancellation_starts),
  cancellationEnds: parseISO(apiEvent.cancellation_ends),
  maxParticipants: apiEvent.max_participants ?? undefined,
  registrationCount: apiEvent.registration_count,
  location: apiEvent.location,
  deleted: apiEvent.deleted === 1,
  price: getEuro(apiEvent.price),
});

const formatRegistration = (registration: ApiRegistration): Registration => ({
  id: registration.id,
  name: registration.name,
  phone: registration.phone,
  email: registration.email,
  answers: registration.answers.map(answer => ({
    questionId: answer.question_id,
    question: answer.question,
    answer: answer.answer,
  })),
  userId:
    registration.user_id === null ? null : tkoalyIdentity(registration.user_id),
});

export default createModule({
  name: 'events',

  routes,

  async setup({ config, bus }) {
    const client = axios.create({
      baseURL: config.eventServiceUrl,
      headers: {
        'X-Token': config.eventServiceToken,
      },
    });

    bus.provide(iface, {
      async getEvents({ starting }) {
        try {
          const res = await client.get<ApiEvent[]>('/api/events', {
            params: { fromDate: starting },
          });

          return res.data.map(parseApiEvent).filter(event => !event.deleted);
        } catch (err) {
          console.error(err);
          throw new Error('Failed to fetch events');
        }
      },

      async getUserEvents(id) {
        try {
          const res = await client.get<ApiEvent[]>(
            `/api/users/${id.value}/events`,
          );

          return res.data.map(parseApiEvent).filter(event => !event.deleted);
        } catch {
          throw new Error(`Failed to fetch events for user ${id.value}`);
        }
      },

      async getEventRegistrations(id) {
        try {
          const res = await client.get<ApiRegistration[]>(
            `/api/events/${id}/registrations`,
          );
          return res.data.map(formatRegistration);
        } catch (err) {
          console.log(err);
          throw new Error(`Failed to fetch registrations for event ${id}`);
        }
      },

      async getEventCustomFields(id) {
        try {
          const res = await client.get<ApiCustomField[]>(
            `/api/events/${id}/fields`,
          );
          return res.data;
        } catch (err) {
          console.log(err);
          throw new Error(`Failed to fetch custom fields for event ${id}`);
        }
      },
    });
  },
});
