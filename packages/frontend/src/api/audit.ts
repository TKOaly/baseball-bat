import { AuditEvent } from '@bbat/common/src/types';
import rtkApi from './rtk-api';
import { createPaginatedQuery } from './pagination';

const auditApi = rtkApi.injectEndpoints({
  endpoints: builder => ({
    getAuditEvents: createPaginatedQuery<AuditEvent>()(builder, {
      query: () => '/audit/events',
      id: (r) => r.entryId,
    }),
  }),
});

export default auditApi;

export const { useGetAuditEventsQuery } = auditApi;
