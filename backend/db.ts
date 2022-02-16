import * as pg from 'pg'
import { SQLStatement } from 'sql-template-strings'

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

export type PgClient = {
  one: <T>(query: SQLStatement) => Promise<T | null>
  any: <T>(query: SQLStatement) => Promise<T[]>
  many: <T>(query: SQLStatement) => Promise<T[]>
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
  }
}
