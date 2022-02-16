import axios, { AxiosInstance, AxiosResponse } from 'axios'
import { Config } from '../config'
import {
  ApiEvent,
  euro,
  EuroValue,
  Event,
  numberFromString,
  TkoAlyUserId,
} from '../../common/types'
import { readFileSync } from 'fs'
import { parseISO } from 'date-fns'
import * as Either from 'fp-ts/lib/Either'
import { pipe } from 'fp-ts/lib/function'

export type EventsService = {
  getEvents: ({ id }: TkoAlyUserId) => Promise<Event[]>
}

const createMockClient = (): AxiosInstance => {
  const file = JSON.parse(
    readFileSync('./mock/event-api-mock.json').toString('utf8')
  )

  return {
    // @ts-ignore
    get: <T>(path: string, _: any): Promise<Partial<AxiosResponse>> =>
      Promise.resolve({ data: file }),
  }
}

const getEuro = (value: string): EuroValue | null =>
  pipe(
    value.replace('€', '').trim(),
    numberFromString.decode,
    Either.fold(() => null, euro)
  )

const parseApiEvent = (apiEvent: ApiEvent): Event => ({
  id: apiEvent.id,
  name: apiEvent.name,
  starts: parseISO(apiEvent.starts),
  registrationStarts: parseISO(apiEvent.registration_starts),
  registrationEnds: parseISO(apiEvent.registration_ends),
  cancellationStarts: parseISO(apiEvent.cancellation_starts),
  cancellationEnds: parseISO(apiEvent.cancellation_ends),
  location: apiEvent.location,
  deleted: apiEvent.deleted === 1,
  price: getEuro(apiEvent.price),
})

export const createEventsService = (config: Config): EventsService => {
  const useMock = !config.userApiUrl || !config.eventServiceToken

  const client = !useMock
    ? axios.create({
        baseURL: config.userApiUrl,
        headers: {
          'X-Token': config.eventServiceToken!,
        },
      })
    : createMockClient()

  return {
    getEvents: ({ id }) =>
      client
        .get<ApiEvent[]>(`/api/users/${id}/events`)
        .then(({ data }) => data.map(parseApiEvent))
        .then(events => events.filter(event => !event.deleted)),
  }
}
