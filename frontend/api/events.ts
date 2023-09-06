import rtkApi from './rtk-api';
import { CustomField, Event, Registration } from '../../common/types';

const eventsApi = rtkApi.injectEndpoints({
  endpoints: builder => ({
    getEvents: builder.query<Event[], { starting?: Date }>({
      query: ({ starting }) => ({
        url: '/events/all',
        params: { starting },
      }),
    }),

    getEventRegistrations: builder.query<Registration[], number>({
      query: id => `/events/${id}/registrations`,
    }),

    getEventCustomFields: builder.query<CustomField[], number>({
      query: id => `/events/${id}/fields`,
    }),
  }),
});

export const {
  useGetEventsQuery,
  useGetEventRegistrationsQuery,
  useGetEventCustomFieldsQuery,
} = eventsApi;

export default eventsApi;
