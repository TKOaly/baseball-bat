import { useState, useEffect } from 'react';
import {
  ApiEndpointQuery,
  QueryArgFrom,
  ResultTypeFrom,
} from '@reduxjs/toolkit/query/react';
import { RootState, useAppDispatch, useAppSelector } from '../store';
import { createSelector } from '@reduxjs/toolkit';

type EndpointDefinitionFrom<E> =
  E extends ApiEndpointQuery<infer D, any> ? D : never; // eslint-disable-line

// eslint-disable-next-line
export function createMultiFetchHook<E extends ApiEndpointQuery<any, any>>(
  endpoint: E,
): (params: QueryArgFrom<EndpointDefinitionFrom<E>>[]) => {
  data: ResultTypeFrom<EndpointDefinitionFrom<E>>[];
  isLoading: boolean;
} {
  const selectMultipleCustomFieldQueries = createSelector(
    [
      (state: RootState) => state,
      (_state: RootState, params: QueryArgFrom<EndpointDefinitionFrom<E>>[]) =>
        params,
    ],
    (state: RootState, params: QueryArgFrom<EndpointDefinitionFrom<E>>[]) =>
      params.map(param => endpoint.select(param)(state)),
  );

  return params => {
    const [results, setResults] = useState({
      data: [] as ResultTypeFrom<EndpointDefinitionFrom<E>>[],
      isLoading: true,
    });

    const dispatch = useAppDispatch();

    useEffect(() => {
      params.forEach(param => {
        const result = dispatch(endpoint.initiate(param));
        result.unsubscribe();
      });
    }, [params]);

    const queries = useAppSelector(state =>
      selectMultipleCustomFieldQueries(state, params),
    );

    useEffect(() => {
      if (queries.every(s => s.isSuccess)) {
        setResults({
          data: queries.map(
            query => query.data as ResultTypeFrom<EndpointDefinitionFrom<E>>,
          ),
          isLoading: false,
        });
      }
    }, [queries]);

    return results;
  };
}
