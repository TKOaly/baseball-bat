import pg from 'pg';
import sql, { SQLStatement } from 'sql-template-strings';
import { Service } from 'typedi';
import * as O from 'fp-ts/lib/Option';
import * as E from 'fp-ts/lib/Either';
import * as TE from 'fp-ts/lib/TaskEither';

pg.types.setTypeParser(20, (value: string) => parseInt(value, 10));

type Join<Items> = Items extends [infer FirstItem, ...infer Rest]
  ? FirstItem extends string
    ? Rest extends string[]
      ? `${FirstItem}${Capitalize<Join<Rest>>}`
      : FirstItem
    : never
  : Items extends string
  ? Items
  : '';

type Split<
  Str,
  Delim extends string,
> = Str extends `${infer Head}${Delim}${infer Rest}`
  ? [Head, ...Split<Rest, Delim>]
  : Str extends string
  ? Str extends ''
    ? never
    : [Str]
  : never;

export type FromDbType<T extends object> = {
  [K in keyof T as Join<Split<K, '_'>>]: T[K];
};

export type TxClient = {
  do: <A>(query: SQLStatement) => Promise<A[]>;
};

@Service()
export class PgClient {
  conn: pg.Pool;

  constructor(conn: pg.Pool) {
    this.conn = conn;
  }

  static create(url: string): PgClient {
    const pool = new pg.Pool({ max: 5, min: 0, connectionString: url });
    return new PgClient(pool);
  }

  async one<T>(query: SQLStatement): Promise<T | null> {
    const result = await this.conn.query(query);

    return (result.rowCount ?? 0) > 0 ? result.rows[0] : null;
  }

  oneTask<T>(query: SQLStatement): TE.TaskEither<Error, O.Option<T>> {
    return async () => {
      const result = await this.conn.query(query);

      return (result.rowCount ?? 0) > 0
        ? E.right(O.some(result.rows[0]))
        : E.right(O.none);
    };
  }

  async any<T>(query: SQLStatement): Promise<T[]> {
    const result = await this.conn.query(query);

    return result.rows;
  }

  async many<T>(query: SQLStatement): Promise<T[]> {
    const result = await this.conn.query(query);

    return (result.rowCount ?? 0) > 0
      ? result.rows
      : Promise.reject('No rows returned');
  }

  async tx<T>(fn: (client: TxClient) => Promise<T>): Promise<T> {
    const conn = await this.conn.connect();

    try {
      await conn.query('BEGIN');

      try {
        const result = await fn(txClient(conn));
        await conn.query('COMMIT');
        return result;
      } catch (err) {
        await conn.query('ROLLBACK');
        console.log('TX ROLLBACK');
        console.log(err);
        throw err;
      }
    } finally {
      conn.release();
    }
  }
}

const txClient = (client: pg.PoolClient): TxClient => {
  return {
    do: async (query: SQLStatement) => {
      return client.query(query).then(res => res.rows);
    },
  };
};

export const appendAll = <T>(
  arr: T[],
  fn: (t: T) => SQLStatement,
  delimiter: string,
) => {
  return arr.reduce(
    (sql, x, index) => sql.append(index === 0 ? '' : delimiter).append(fn(x)),
    sql``,
  );
};