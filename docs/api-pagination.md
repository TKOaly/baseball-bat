# API Pagination

Select endpoints of the REST API support cursor/keyset based pagination.
This document details the implementation of this pagination mechanism as
well as request and response conventions used by these endpoints.

## Paginated endpoints

At the time of writing, the following endpoints support pagination:

 1. `/api/debt`
 2. `/api/debtCenters/:id/debts`
 3. `/api/banking/accounts/:account/transactions`
 4. `/api/banking/statements/:statement/transactions`
 5. `/api/payers`
 6. `/api/payers/:id/debts`

## Conventions

RTK-Query endpoints following these conventions can be created using the `createPaginatedQuery` utility found in `packages/frontend/src/api/pagination.ts`.
On the backend side, identically named `createPaginatedQuery` utility fround in `packages/backend/src/db/paginatin.ts` can be used to create SQL queries which adhere to these conventions and support pagination.

### Request

Paginated endpoints support sorting and limiting through the following query parameters:

| Parameter      | Type              | Default    | Description |
|----------------|-------------------|------------|-------------|
| `limit`        | `number`          | `Infinity` | Maximum number of items to be returned. |
| `sort[column]` | `string`          | `null`     | Property by which the returned items should be sorted. Corresponds directly to a column returned by the underlying SQL query and accepted values vary by the endpoint in question. |
| `sort[dir]`    | `'asc' \| 'desc'` | `null`     | Direction in which the above defined column should be sorted. |
| `cursor`       | `string`          | `null`     | Cursor which determines point of the first returned item in the sequence. |

### Response

Paginated endpoints return a JSON object of the following form:

| Property | Type | Present | Description |
|----------|------|----|----|
| `result` | `Array` | Always | List of the items. |
| `nextCursor` | `string` | If more items are available. | Cursor which can be used a the `cursor` query parameter in order to fetch more items, starting from the item directly following the last item in this resonse. |

## Implementation
 
The method of pagination implemented is keyset based pagination. This means that the cursor returned in the paginated responses contains information about the last seen item, and subsequent queries use that information to "seek" to the correct point in the list.
The cursor should be considered opaque to all code expect to the code in `packages/backend/src/db/pagination.ts`, which is responsible for generating the cursors and the SQL queries from the cursors. In practice, the cursor value is a base64-encoded JSON string, which contains last seen values for all the sorted columns, as well as their order of sorting. For example:

```JSON
{
  "name": ["Teppo Testaaja", "desc"],
  "id": ["6f6e815e-7a2f-4c41-b303-4fcad3c8b32d", "asc"]
}
```

Each endpoint has a single specific "pagination key column", which is always present in the cursor and ties in the result ordering are determined by it. This column is used to pinpoint the exact starting point of the result set when pagination breaks in middle of a series of identical values in the sorted column(s).
Special care is required in the implementation in order to correctly handle sorting by nullable columns, as they return `NULL` for all conventional comparison operators (`>`, `<`, `<=`, `>=`, `=` and `<>`).

## Caveats

 - No filter-pushdown is implements. Filtering must be implemented client-side. This leads to repeated queries to the paginated endpoints untill the wanted amount of matching items are found.
 - Backwards pagination is not supported.
 - Sorting must be implemented on the database layer and sorting by values computed in the backend or in the frontend is not possible.
