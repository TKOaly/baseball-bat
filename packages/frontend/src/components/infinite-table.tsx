import { PaginationQueryResponse } from '@bbat/common/src/types';
import { TableViewProps, Table } from '@bbat/ui/src/table';
import { QueryHooks } from '@reduxjs/toolkit/dist/query/react/buildHooks';
import { QueryDefinition } from '@reduxjs/toolkit/query';
import { useCallback, useState } from 'react';

export type Props<T, Q extends PaginatedBaseQuery> = Omit<
  TableViewProps<T & { key: string }, any, any>,
  | 'rows'
  | 'loading'
  | 'refreshing'
  | 'showBottomLoading'
  | 'onEnd'
  | 'onSortChange'
> & {
  endpoint: QueryHooks<
    QueryDefinition<Q, any, any, PaginationQueryResponse<T>>
  >;
  query?: Omit<Q, 'cursor' | 'sort' | 'limit'>;
  chunk?: number;
};

export type PaginatedBaseQuery = {
  cursor?: string;
  sort?: { column: string; dir: 'asc' | 'desc' };
  limit?: number;
};
export type PaginatedQueryDefinition<
  T,
  Q extends PaginatedBaseQuery,
> = QueryDefinition<Q, any, any, PaginationQueryResponse<T>>;

export const InfiniteTable = <T, Q extends PaginatedBaseQuery>({
  query,
  endpoint,
  chunk: limit = 30,
  ...props
}: Props<T, Q>) => {
  const [sort, setSort] = useState<[string, 'asc' | 'desc']>();

  const [fetchMore] = endpoint.useLazyQuery();
  const { data, isLoading, isFetching, originalArgs } = endpoint.useQuery({
    ...query,
    limit,
    sort: sort ? { column: sort[0], dir: sort[1] } : undefined,
  } as Q);

  const onEnd = useCallback(() => {
    if (data?.nextCursor) {
      fetchMore({
        ...query,
        sort: sort ? { column: sort[0], dir: sort[1] } : undefined,
        limit,
        cursor: data.nextCursor,
      } as Q);
    }
  }, [data, fetchMore, sort, query]);

  const rows = (data?.result ?? []).map(item => ({
    key: (item as any).id,
    ...item,
  }));

  return (
    <Table
      loading={isLoading}
      refreshing={isFetching && !originalArgs?.cursor}
      showBottomLoading={!!data?.nextCursor}
      onSortChange={(col, dir) =>
        col && dir ? setSort([col, dir]) : setSort(undefined)
      }
      rows={rows}
      onEnd={onEnd}
      {...props}
    />
  );
};
