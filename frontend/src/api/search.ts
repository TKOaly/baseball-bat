import rtkApi from './rtk-api';

export type SearchResult = {
  type: 'debt' | 'payer';
  id: string;
  name: string;
};

const searchApi = rtkApi.injectEndpoints({
  endpoints: builder => ({
    search: builder.query<SearchResult[], { term: string; type?: string }>({
      query: ({ term, type }) => ({
        url: '/search',
        params: { term, type },
      }),
    }),
  }),
});

export const { useSearchQuery } = searchApi;
