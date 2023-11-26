import rtkApi from './rtk-api';
import {
  DebtComponent,
  NewDebtComponent,
  Debt,
  NewDebt,
  DebtWithPayer,
  Payment,
  Email,
  DebtPatch,
  DebtComponentPatch,
  MultipleDebtPatchValues,
} from '@bbat/common/types';
import { omit } from 'remeda';
import { parseISO } from 'date-fns';

export type DebtResponse = DebtWithPayer & {
  debtComponents: Array<DebtComponent>;
};

export type CreateDebtPayload = Omit<NewDebt, 'components' | 'center'> & {
  components: (string | Omit<NewDebtComponent, 'debtCenterId'>)[];
  center: string | { name: string; url: string; description: string };
};

const debtApi = rtkApi.injectEndpoints({
  endpoints: builder => ({
    createDebtComponent: builder.mutation<DebtComponent, NewDebtComponent>({
      query: debtComponent => ({
        method: 'POST',
        url: '/debt/component',
        body: debtComponent,
      }),
    }),

    deleteDebtComponent: builder.mutation<
      { affectedDebts: string[] },
      { debtCenterId: string; debtComponentId: string }
    >({
      query: ({ debtCenterId, debtComponentId }) => ({
        method: 'DELETE',
        url: `/debtCenters/${debtCenterId}/components/${debtComponentId}`,
      }),
    }),

    updateDebtComponent: builder.mutation<
      DebtComponent,
      {
        debtCenterId: string;
        debtComponentId: string;
        values: DebtComponentPatch;
      }
    >({
      query: ({ debtCenterId, debtComponentId, values }) => ({
        method: 'PATCH',
        url: `/debtCenters/${debtCenterId}/components/${debtComponentId}`,
        body: values,
      }),
    }),

    createDebt: builder.mutation<Debt, CreateDebtPayload>({
      query: debt => ({
        method: 'POST',
        url: '/debt',
        body: debt,
      }),
      invalidatesTags: () => [{ type: 'Debt', id: 'LIST' }],
    }),

    getDebtComponents: builder.query<DebtComponent, void>({
      query: () => '/debtComponent',
    }),

    getDebtComponentsByCenter: builder.query<DebtComponent[], string>({
      query: id => `/debtCenters/${id}/components`,
    }),

    getDebtsByCenter: builder.query<DebtWithPayer[], string>({
      query: id => `/debtCenters/${id}/debts`,
      providesTags: result => [
        { type: 'Debt' as const, id: 'LIST' },
        ...(result ?? []).map(debt => ({ type: 'Debt' as const, id: debt.id })),
      ],
    }),

    getDebtsByTag: builder.query<Debt[], string>({
      query: tag => `/debt/by-tag/${tag}`,
      providesTags: result => [
        { type: 'Debt' as const, id: 'LIST' },
        ...(result ?? []).map(debt => ({ type: 'Debt' as const, id: debt.id })),
      ],
    }),

    getDebt: builder.query<DebtResponse, string>({
      query: id => `/debt/${id}`,
      providesTags: result => result ? [{ type: 'Debt', id: result.id }] : [],
      transformResponse: (result: Omit<DebtResponse, 'createdAt' | 'updatedAt' | 'dueDate' | 'date'> & { createdAt: string, updatedAt: string, dueDate: string, date: string }) => result && ({
        ...result,
        createdAt: parseISO(result.createdAt),
        updatedAt: parseISO(result.updatedAt),
        dueDate: result.dueDate ? parseISO(result.dueDate) : null,
        date: result.date ? parseISO(result.date) : null,
      }),
    }),

    getDebts: builder.query<DebtWithPayer[], void>({
      query: () => '/debt',
      providesTags: result => [
        { type: 'Debt' as const, id: 'LIST' },
        ...(result ?? []).map(debt => ({ type: 'Debt' as const, id: debt.id })),
      ],
    }),

    getDebtsByPayment: builder.query<DebtWithPayer[], string>({
      query: id => `/debt/by-payment/${id}`,
      providesTags: result => [
        { type: 'Debt' as const, id: 'LIST' },
        ...(result ?? []).map(debt => ({ type: 'Debt' as const, id: debt.id })),
      ],
    }),

    publishDebts: builder.mutation<void, string[]>({
      query: ids => ({
        method: 'POST',
        url: '/debt/publish',
        body: { ids },
      }),
      invalidatesTags: (_result, _err, ids) => [
        { type: 'Debt' as const, id: 'LIST' },
        { type: 'Email' as const, id: 'LIST' },
        { type: 'Payment' as const, id: 'LIST' },
        ...ids.map(id => ({ type: 'Debt' as const, id })),
      ],
    }),

    massCreateDebts: builder.mutation<any, any>({
      query: payload => ({
        method: 'POST',
        url: '/debt/mass-create',
        body: payload,
      }),
      invalidatesTags: [{ type: 'Debt', id: 'LIST' }],
    }),

    massCreateDebtsProgress: builder.query<
      { current: number; total: number; message: string; result: any },
      string
    >({
      query: id => ({
        url: '/debt/mass-create/poll/' + id,
      }),
    }),

    deleteDebt: builder.mutation<void, string>({
      query: id => ({
        method: 'DELETE',
        url: `/debt/${id}`,
      }),
      invalidatesTags: (_, __, id) => [
        { type: 'Debt', id: 'LIST' },
        { type: 'Debt', id },
      ],
    }),

    creditDebt: builder.mutation<void, string>({
      query: id => ({
        method: 'POST',
        url: `/debt/${id}/credit`,
      }),
      invalidatesTags: (_, __, id) => [
        { type: 'Debt', id: 'LIST' },
        { type: 'Debt', id },
      ],
    }),

    markPaidWithCash: builder.mutation<Payment, string>({
      query: id => ({
        method: 'POST',
        url: `/debt/${id}/mark-paid-with-cash`,
      }),
      invalidatesTags: (_, __, id) => [
        { type: 'Debt', id: 'LIST' },
        { type: 'Debt', id },
        { type: 'Payment', id: 'LIST' },
      ],
    }),

    sendReminder: builder.mutation<Email, { id: string; draft?: boolean }>({
      query: ({ id, draft }) => ({
        method: 'POST',
        url: `/debt/${id}/send-reminder`,
        params: {
          draft: draft ? 'yes' : 'no',
        },
      }),
      invalidatesTags: [{ type: 'Email', id: 'LIST' }],
    }),

    sendAllReminders: builder.mutation<
      { messageCount: number; payerCount: number },
      { ignoreCooldown: boolean; send: boolean; debts: null | Array<string> }
    >({
      query: body => ({
        method: 'POST',
        url: '/debt/send-reminders',
        body,
      }),
      invalidatesTags: [{ type: 'Email', id: 'LIST' }],
    }),

    updateDebt: builder.mutation<Debt, DebtPatch>({
      query: patch => ({
        method: 'PATCH',
        url: `/debt/${patch.id}`,
        body: omit(patch, ['id']),
      }),
      invalidatesTags: result => [
        { type: 'Debt', id: 'LIST' },
        { type: 'Debt', id: result?.id },
      ],
    }),

    updateMultipleDebts: builder.mutation<
      Debt[],
      { debts: string[]; values: MultipleDebtPatchValues }
    >({
      query: body => ({
        method: 'POST',
        url: '/debt/update-multiple',
        body,
      }),
      invalidatesTags: result =>
        (result ?? []).map(({ id }) => ({ type: 'Debt' as const, id })),
    }),

    getDebtsByEmail: builder.query<Debt[], string>({
      query: id => ({
        method: 'GET',
        url: `/debt/by-email/${id}`,
      }),
      providesTags: result =>
        (result ?? []).map(({ id }) => ({ type: 'Debt' as const, id })),
    }),
  }),
});

export const {
  useCreateDebtComponentMutation,
  useCreateDebtMutation,
  useGetDebtComponentsQuery,
  useGetDebtComponentsByCenterQuery,
  useGetDebtsByCenterQuery,
  useGetDebtQuery,
  useGetDebtsQuery,
  usePublishDebtsMutation,
  useMassCreateDebtsMutation,
  useGetDebtsByPaymentQuery,
  useDeleteDebtMutation,
  useCreditDebtMutation,
  useMarkPaidWithCashMutation,
  useSendReminderMutation,
  useSendAllRemindersMutation,
  useGetDebtsByTagQuery,
  useUpdateDebtMutation,
  useDeleteDebtComponentMutation,
  useUpdateMultipleDebtsMutation,
  useMassCreateDebtsProgressQuery,
  useUpdateDebtComponentMutation,
  useGetDebtsByEmailQuery,
} = debtApi;

export default debtApi;
