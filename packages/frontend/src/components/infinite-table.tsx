import {
  PaginationQueryArgs,
  PaginationQueryResponse,
} from '@bbat/common/src/types';
import { TableViewProps, Table } from '@bbat/ui/src/table';
import { QueryDefinition } from '@reduxjs/toolkit/query';
import { TypedUseLazyQuery, TypedUseQuery } from '@reduxjs/toolkit/query/react';
import { useCallback, useEffect, useState } from 'react';

export type Hooks<T, Q extends PaginationQueryArgs> = {
  useQuery: TypedUseQuery<PaginationQueryResponse<T>, Q, any>;
  useLazyQuery: TypedUseLazyQuery<PaginationQueryResponse<T>, Q, any>;
};

export type Props<T, Q extends PaginationQueryArgs> = Omit<
  TableViewProps<T & { key: string }, any, any>,
  | 'rows'
  | 'loading'
  | 'refreshing'
  | 'showBottomLoading'
  | 'fetchMore'
  | 'more'
  | 'onSortChange'
> & {
  endpoint: Hooks<T, Q>;
  chunk?: number;
  query?: Omit<Q, keyof PaginatedBaseQuery>;
  refresh?: number;
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

export const InfiniteTable = <T, Q extends PaginationQueryArgs>({
  endpoint,
  chunk: limit = 30,
  refresh,
  ...props
}: Props<T, Q>) => {
  const [sort, setSort] = useState<[string, 'asc' | 'desc']>();

  const createQuery = (opts: PaginatedBaseQuery): Q => {
    return {
      ...opts,
      ...('query' in props ? props.query : {}),
    } as Q;
  };

  const [fetchMoreQuery] = endpoint.useLazyQuery();
  const { data, isLoading, isFetching, originalArgs, refetch } =
    endpoint.useQuery(
      createQuery({
        limit,
        sort: sort ? { column: sort[0], dir: sort[1] } : undefined,
      }),
    );

  useEffect(() => {
    if (refresh) {
      const interval = setInterval(() => refetch(), refresh);
      return () => clearInterval(interval);
    }
  }, [refresh, refetch]);

  const fetchMore = useCallback(
    (amount: number | null) => {
      if (data?.nextCursor) {
        fetchMoreQuery(
          createQuery({
            sort: sort ? { column: sort[0], dir: sort[1] } : undefined,
            limit: amount ?? undefined,
            cursor: data.nextCursor,
          }),
        );
      }
    },
    [data, fetchMoreQuery, sort, props],
  );

  const rows = (data?.result ?? []).map(item => ({
    key: (item as any).id,
    ...item,
  }));

  return (
    <Table
      loading={isLoading}
      refreshing={isFetching && !originalArgs?.cursor && refresh === null}
      showBottomLoading={!!data?.nextCursor}
      onSortChange={(col, dir) =>
        col && dir ? setSort([col, dir]) : setSort(undefined)
      }
      more={!!data?.nextCursor}
      rows={rows}
      fetchMore={fetchMore}
      {...props}
    />
  );
};
