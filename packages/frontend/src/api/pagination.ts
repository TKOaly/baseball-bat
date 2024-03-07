import {
  EndpointBuilder,
  QueryDefinition,
} from '@reduxjs/toolkit/dist/query/endpointDefinitions';
import { OmitFromUnion } from '@reduxjs/toolkit/dist/query/tsHelpers';
import { FetchArgs, fetchBaseQuery } from '@reduxjs/toolkit/query';

export type PaginatedQueryResponse<T> = {
  result: T[];
  nextCursor?: string;
};

export type PaginatedQueryArg = {
  cursor?: string;
  sort?: {
    column: string;
    dir: 'asc' | 'desc';
  };
};

export type TagTypesFromBuilder<B extends EndpointBuilder<any, any, any>> =
  B extends EndpointBuilder<any, infer T, any> ? T : never;

export const createPaginatedQuery =
  <T extends { id: string | number }, Q = void>() =>
  <B extends EndpointBuilder<any, any, any>>(
    builder: B,
    options: OmitFromUnion<
      QueryDefinition<
        Q & PaginatedQueryArg,
        ReturnType<typeof fetchBaseQuery>,
        TagTypesFromBuilder<B>,
        PaginatedQueryResponse<T>,
        any
      >,
      'type'
    > & { paginationTag?: TagTypesFromBuilder<B> },
  ) =>
    builder.query<PaginatedQueryResponse<T>, Q & PaginatedQueryArg>({
      ...(options as any),
      query: ({ cursor, sort, ...rest }) => {
        const query = options.query?.(rest as any);

        let url;
        let opts: Omit<FetchArgs, 'url'> = {};

        if (typeof query === 'string') {
          url = query;
        } else if (typeof query === 'object') {
          url = query.url;
          opts = query;
        } else {
          return;
        }

        let searchInUrl = false;

        if (url) {
          let search = new URLSearchParams();

          if (url.includes('?')) {
            const [path, searchStr] = url.split('?', 2);
            url = path;
            search = new URLSearchParams(searchStr);

            if (cursor) {
              search.append('cursor', cursor);
            }

            if (sort) {
              search.append('sort[column]', sort.column);
              search.append('sort[dir]', sort.dir);
            }

            url = `${url}?${search}`;
            searchInUrl = true;
          }
        }

        if (!searchInUrl) {
          if (!opts.params) {
            opts.params = {};
          }

          if (cursor) {
            opts.params.cursor = cursor;
          }

          if (sort) {
            opts.params['sort[column]'] = sort.column;
            opts.params['sort[dir]'] = sort.dir;
          }
        }

        return {
          ...opts,
          url,
        };
      },
      providesTags:
        options.providesTags ??
        (!options.paginationTag
          ? undefined
          : result => [
              { type: 'Debt' as const, id: 'LIST' },
              ...(result?.result ?? []).map(debt => ({
                type: 'Debt' as const,
                id: debt.id,
              })),
            ]),
      serializeQueryArgs: args => {
        const newArgs = { ...args.queryArgs };
        delete newArgs.cursor;
        return newArgs;
      },
      merge: (
        currentCache: PaginatedQueryResponse<T> & { prevCursors?: string[] },
        newItems,
        { arg },
      ) => {
        if (!arg.cursor) {
          return newItems;
        }

        if (arg.cursor && currentCache.prevCursors?.includes(arg.cursor)) {
          return;
        }

        currentCache.result.push(...newItems.result);
        currentCache.nextCursor = newItems.nextCursor;

        if (arg.cursor) {
          if (!currentCache.prevCursors) {
            currentCache.prevCursors = [arg.cursor];
          } else {
            currentCache.prevCursors.push(arg.cursor);
          }
        }
      },
    });
