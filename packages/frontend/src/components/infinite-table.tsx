import {
  PaginationQueryArgs,
  PaginationQueryResponse,
} from '@bbat/common/src/types';
import * as R from 'remeda';
import { TableViewProps, Table, Column } from '@bbat/ui/src/table';
import { QueryDefinition } from '@reduxjs/toolkit/query';
import { TypedUseLazyQuery, TypedUseQuery } from '@reduxjs/toolkit/query/react';
import { useCallback, useEffect, useState } from 'react';

export type Hooks<T, Q extends PaginationQueryArgs> = {
  useQuery: TypedUseQuery<PaginationQueryResponse<T>, Q, any>;
  useLazyQuery: TypedUseLazyQuery<PaginationQueryResponse<T>, Q, any>;
};

type PushdownFunction = (
  v: any,
  include: boolean,
) => Partial<Record<string, Partial<Record<string, unknown>>>> | undefined;

export type Props<T, Q extends PaginationQueryArgs> = Omit<
  TableViewProps<T & { key: string }, any, any>,
  | 'rows'
  | 'loading'
  | 'refreshing'
  | 'showBottomLoading'
  | 'fetchMore'
  | 'more'
  | 'onSortChange'
  | 'columns'
> & {
  endpoint: Hooks<T, Q>;
  chunk?: number;
  query?: Omit<Q, keyof PaginatedBaseQuery>;
  refresh?: number;
  columns: Array<
    Column<T & { key: string }, any, any> & {
      filter?: { pushdown?: boolean | PushdownFunction };
    }
  >;
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
  const [filter, setFilter] = useState({});

  const createQuery = (opts: PaginatedBaseQuery): Q => {
    return {
      ...opts,
      filter,
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

  const handleFilterChange = useCallback(
    (filters: Record<string, any>) => {
      setFilter(
        R.pipe(
          filters,
          R.entries,
          R.flatMap(([column, { search, allowlist, blocklist }]) => {
            const col = props.columns.find(c => c.key === column);

            if (!col || !col.filter?.pushdown) return [];

            const pushdown: PushdownFunction = (
              value: any,
              include: boolean,
            ) => {
              if (typeof col.filter?.pushdown === 'function') {
                const result = col.filter.pushdown(value, include);

                if (result !== undefined) {
                  return result;
                }
              }

              let transform = (v: any) => `${v}`;
              let op;

              if (Array.isArray(value)) {
                op = include ? 'in' : 'not_in';
                transform = v => v.map(transform).join(',');
              } else {
                op = include ? 'eq' : 'neq';
              }

              return { [col.key]: { [op]: transform(value) } };
            };

            return R.pipe(
              [
                allowlist.map((value: any) => pushdown(value, true)),
                blocklist.map((value: any) => pushdown(value, false)),
                search ? [{ [col.key]: { like: search } }] : [],
              ],
              v => (console.log('TAP:', v), v),
              R.flatten,
            );
          }),
          R.reduce(R.mergeDeep, {}),
        ),
      );
      props.onFilterChange?.(filters);
    },
    [props.columns, props.onFilterChange],
  );

  const onSortChange = useCallback(
    (col?: string, dir?: 'asc' | 'desc') =>
      col && dir ? setSort([col, dir]) : setSort(undefined),
    [setSort],
  );

  return (
    <Table
      loading={isLoading}
      refreshing={isFetching && !originalArgs?.cursor && refresh === null}
      showBottomLoading={!!data?.nextCursor}
      onSortChange={onSortChange}
      more={!!data?.nextCursor}
      rows={rows}
      fetchMore={fetchMore}
      {...props}
      onFilterChange={handleFilterChange}
    />
  );
};
