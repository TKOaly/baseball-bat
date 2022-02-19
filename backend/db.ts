import * as pg from 'pg'
import sql, { SQLStatement } from 'sql-template-strings'

type Join<Items> = Items extends [infer FirstItem, ...infer Rest]
  ? FirstItem extends string
    ? Rest extends string[]
      ? `${FirstItem}${Capitalize<Join<Rest>>}`
      : FirstItem
    : never
  : Items extends string
  ? Items
  : ''

type Split<
  Str,
  Delim extends string
> = Str extends `${infer Head}${Delim}${infer Rest}`
  ? [Head, ...Split<Rest, Delim>]
  : Str extends string
  ? Str extends ''
    ? never
    : [Str]
  : never

export type FromDbType<T extends object> = {
  [K in keyof T as Join<Split<K, '_'>>]: T[K]
}

type TxClient = {
  do: <A>(query: SQLStatement) => Promise<A[]>
}

export type PgClient = {
  one: <T>(query: SQLStatement) => Promise<T | null>
  any: <T>(query: SQLStatement) => Promise<T[]>
  many: <T>(query: SQLStatement) => Promise<T[]>
  tx: <T>(fn: (client: TxClient) => Promise<T>) => Promise<T>
}

const txClient = (client: pg.Pool): TxClient => {
  client.query('BEGIN')
  return {
    do: (query: SQLStatement) => client.query(query).then(res => res.rows),
  }
}

export const createPgClient = (url: string): PgClient => {
  const client = new pg.Pool({ max: 5, min: 0, connectionString: url })

  return {
    one: statement =>
      client
        .query(statement)
        .then(result => (result.rowCount > 0 ? result.rows[0] : null)),
    many: statement =>
      client
        .query(statement)
        .then(result =>
          result.rowCount > 0 ? result.rows : Promise.reject('No rows returned')
        ),
    any: statement => client.query(statement).then(result => result.rows),
    tx: fn =>
      fn(txClient(client))
        .then(res => {
          client.query('COMMIT')
          return res as any
        })
        .catch(() => client.query('ROLLBACK')),
  }
}

export const appendAll = <T>(
  arr: T[],
  fn: (t: T) => SQLStatement,
  delimiter: string
) => {
  return arr.reduce(
    (sql, x, index) => sql.append(index === 0 ? '' : delimiter).append(fn(x)),
    sql``
  )
}
