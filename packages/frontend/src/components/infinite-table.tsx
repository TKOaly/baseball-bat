import { TableViewProps, Table } from '@bbat/ui/src/table';
import { QueryHooks } from '@reduxjs/toolkit/dist/query/react/buildHooks';
import { QueryDefinition } from '@reduxjs/toolkit/query';
import { useCallback, useState } from 'react';

export type Props<T, Q extends PaginatedBaseQuery> = Omit<
  TableViewProps<T & { key: string }, any, any>,
  'rows' | 'loading'
> & {
  endpoint: QueryHooks<
    QueryDefinition<Q, any, any, { result: T[]; nextCursor?: string }>
  >;
  query: Omit<Q, 'cursor' | 'sort'>;
};

export type PaginatedBaseQuery = {
  cursor?: string;
  sort?: { column: string; dir: 'asc' | 'desc' };
};
export type PaginatedQueryDefinition<
  T,
  Q extends PaginatedBaseQuery,
> = QueryDefinition<Q, any, any, { result: T[]; nextCursor?: string }>;

export const InfiniteTable = <T, Q extends PaginatedBaseQuery>({
  columns,
  query,
  endpoint,
  ...props
}: Props<T, Q>) => {
  const [sort, setSort] = useState<[string, 'asc' | 'desc']>();

  const [fetchMore] = endpoint.useLazyQuery();
  const { data } = endpoint.useQuery({
    ...query,
    sort: sort ? { column: sort[0], dir: sort[1] } : undefined,
  } as Q);

  const onEnd = useCallback(() => {
    if (data?.nextCursor) {
      fetchMore({
        ...query,
        sort: sort ? { column: sort[0], dir: sort[1] } : undefined,
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
      showBottomLoading={!!data?.nextCursor}
      columns={columns}
      onSortChange={(col, dir) =>
        col && dir ? setSort([col, dir]) : setSort(undefined)
      }
      rows={rows}
      onEnd={onEnd}
      {...props}
    />
  );
};
