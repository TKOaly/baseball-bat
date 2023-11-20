import rootApi from './rtk-api';
import { DebtCenter, DebtCenterPatch, NewDebtCenter } from 'common/types';

const debtCentersApi = rootApi.injectEndpoints({
  endpoints: builder => ({
    getDebtCenters: builder.query<DebtCenter[], void>({
      query: () => '/debtCenters',
      providesTags: centers => [
        { type: 'DebtCenter', id: 'LIST' },
        ...centers.map(({ id }) => ({ type: 'DebtCenter' as const, id })),
      ],
    }),

    getDebtCenter: builder.query<DebtCenter, string>({
      query: id => `/debtCenters/${id}`,
    }),

    createDebtCenter: builder.mutation({
      query: (debtCenter: NewDebtCenter) => ({
        url: '/debtCenters',
        method: 'POST',
        body: debtCenter,
      }),
    }),

    createDebtCenterFromEvent: builder.mutation<
      DebtCenter,
      { events: number[]; settings: any }
    >({
      query: payload => ({
        url: '/debtCenters/fromEvent',
        method: 'POST',
        body: payload,
      }),
    }),

    updateDebtCenter: builder.mutation<DebtCenter, DebtCenterPatch>({
      query: ({ id, ...body }) => ({
        url: `/debtCenters/${id}`,
        method: 'PUT',
        body,
      }),
      invalidatesTags: ({ id }) => [
        { type: 'DebtCenter', id },
        { type: 'DebtCenter', id: 'LIST' },
      ],
    }),

    deleteDebtCenter: builder.mutation<void, string>({
      query: id => ({
        method: 'DELETE',
        url: `/debtCenters/${id}`,
      }),
      invalidatesTags: (_, __, id) => [{ type: 'DebtCenter', id }],
    }),
  }),
});

export const {
  useGetDebtCentersQuery,
  useGetDebtCenterQuery,
  useCreateDebtCenterMutation,
  useCreateDebtCenterFromEventMutation,
  useUpdateDebtCenterMutation,
  useDeleteDebtCenterMutation,
} = debtCentersApi;

export default debtCentersApi;
