import axios, { AxiosResponse } from 'axios';
import { Config } from '../config';
import {
  ApiCustomField,
  ApiEvent,
  ApiRegistration,
  CustomField,
  euro,
  EuroValue,
  Event,
  numberFromString,
  Registration,
  tkoalyIdentity,
  TkoalyIdentity,
} from '../../common/types';
import { readFileSync } from 'fs';
import { parseISO } from 'date-fns';
import * as Either from 'fp-ts/lib/Either';
import { pipe } from 'fp-ts/lib/function';
import { Inject, Service } from 'typedi';

const getEuro = (value: string): EuroValue | null =>
  pipe(
    value.replace('€', '').trim(),
    numberFromString.decode,
    Either.fold(() => null, euro),
  );

const parseApiEvent = (apiEvent: ApiEvent): Event => ({
  id: apiEvent.id,
  name: apiEvent.name,
  starts: parseISO(apiEvent.starts),
  registrationStarts: parseISO(apiEvent.registration_starts),
  registrationEnds: parseISO(apiEvent.registration_ends),
  cancellationStarts: parseISO(apiEvent.cancellation_starts),
  cancellationEnds: parseISO(apiEvent.cancellation_ends),
  maxParticipants: apiEvent.max_participants,
  registrationCount: apiEvent.registration_count,
  location: apiEvent.location,
  deleted: apiEvent.deleted === 1,
  price: apiEvent.price ? getEuro(apiEvent.price) : euro(0),
});

const formatRegistration = (registration: ApiRegistration) => ({
  id: registration.id,
  name: registration.name,
  phone: registration.phone,
  email: registration.email,
  answers: registration.answers,
  userId:
    registration.user_id === null ? null : tkoalyIdentity(registration.user_id),
});

@Service()
export class EventsService {
  @Inject(() => Config)
  config: Config;

  private _client: ReturnType<typeof axios.create> | null = null;

  get client() {
    if (this._client !== null) {
      return this._client;
    }

    this._client = axios.create({
      baseURL: this.config.eventServiceUrl,
      headers: {
        'X-Token': this.config.eventServiceToken,
      },
    });

    return this._client;
  }

  static createMock() {
    const file = JSON.parse(
      readFileSync('./mock/event-api-mock.json').toString('utf8'),
    );

    const client = {
      // eslint-disable-next-line
      // @ts-ignore
      get: (): Promise<Partial<AxiosResponse>> =>
        Promise.resolve({ data: file }),
    };

    const service = new EventsService();
    service._client = client as any;
    return service;
  }

  async getAllEvents({ starting }: { starting: Date }): Promise<Event[]> {
    try {
      const res = await this.client.get<ApiEvent[]>('/api/events', {
        params: { fromDate: starting },
      });

      return res.data.map(parseApiEvent).filter(event => !event.deleted);
    } catch (err) {
      console.error(err);
      throw new Error('Failed to fetch events');
    }
  }

  async getEvents(id: TkoalyIdentity): Promise<Event[]> {
    try {
      const res = await this.client.get<ApiEvent[]>(
        `/api/users/${id.value}/events`,
      );

      return res.data.map(parseApiEvent).filter(event => !event.deleted);
    } catch {
      throw new Error(`Failed to fetch events for user ${id.value}`);
    }
  }

  async getEventRegistrations(id: number): Promise<Registration[]> {
    try {
      const res = await this.client.get<ApiRegistration[]>(
        `/api/events/${id}/registrations`,
      );
      return res.data.map(formatRegistration);
    } catch (err) {
      console.log(err);
      throw new Error(`Failed to fetch registrations for event ${id}`);
    }
  }

  async getEventCustomFields(id: number): Promise<CustomField[]> {
    try {
      const res = await this.client.get<ApiCustomField[]>(
        `/api/events/${id}/fields`,
      );
      return res.data;
    } catch (err) {
      console.log(err);
      throw new Error(`Failed to fetch custom fields for event ${id}`);
    }
  }
}
