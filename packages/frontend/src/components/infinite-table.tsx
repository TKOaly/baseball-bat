import {
  PaginationQueryArgs,
  PaginationQueryResponse,
} from '@bbat/common/src/types';
import { TableViewProps, Table } from '@bbat/ui/src/table';
import { QueryDefinition } from '@reduxjs/toolkit/query';
import { TypedUseLazyQuery, TypedUseQuery } from '@reduxjs/toolkit/query/react';
import { useCallback, useState } from 'react';

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
  | 'onEnd'
  | 'onSortChange'
> & {
  endpoint: Hooks<T, Q>;
  chunk?: number;
  query?: Omit<Q, keyof PaginatedBaseQuery>;
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
  ...props
}: Props<T, Q>) => {
  const [sort, setSort] = useState<[string, 'asc' | 'desc']>();

  const createQuery = (opts: PaginatedBaseQuery): Q => {
    return {
      ...opts,
      ...('query' in props ? props.query : {}),
    } as Q;
  };

  const [fetchMore] = endpoint.useLazyQuery();
  const { data, isLoading, isFetching, originalArgs } = endpoint.useQuery(
    createQuery({
      limit,
      sort: sort ? { column: sort[0], dir: sort[1] } : undefined,
    }),
  );

  const onEnd = useCallback(() => {
    if (data?.nextCursor) {
      fetchMore(
        createQuery({
          sort: sort ? { column: sort[0], dir: sort[1] } : undefined,
          limit,
          cursor: data.nextCursor,
        }),
      );
    }
  }, [data, fetchMore, sort, props]);

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
