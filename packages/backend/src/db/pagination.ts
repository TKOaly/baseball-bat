import * as t from 'io-ts';
import * as tt from 'io-ts-types';
import { Connection } from './connection';
import { flow, pipe } from 'fp-ts/function';
import * as O from 'fp-ts/Option';
import { sql, Sql } from './template';
import { Parser } from 'typera-express';
import { paginationQuery } from '@bbat/common/types';
import { ok } from 'typera-express/response';

const cursor = t.record(
  t.string,
  t.tuple([
    t.union([t.string, t.number, t.null, tt.DateFromISOString]),
    t.union([t.literal('desc'), t.literal('asc')]),
  ]),
);

type Cursor = t.TypeOf<typeof cursor>;

const serializeCursor = (cursor: Cursor) =>
  Buffer.from(JSON.stringify(cursor), 'utf-8').toString('base64');

const parseCursor = (cursorString: string) => {
  const json = JSON.parse(
    Buffer.from(cursorString, 'base64').toString('utf-8'),
  );
  return cursor.decode(json);
};

type QueryOptions<Row, Result> = {
  where?: Sql;
  order?: Array<[string, 'desc' | 'asc']>;
  cursor?: string;
  limit?: number;
  map?: (row: Row) => Result;
};

type RowOf<T extends QueryOptions<any, any>> =
  T extends QueryOptions<infer R, any> ? R : never;
type Coalesce<T, D> = T extends undefined | null
  ? D
  : unknown extends T
    ? D
    : T;
type ResultOf<T extends QueryOptions<any, any>> =
  T extends QueryOptions<any, infer R> ? R : never;
type MappedResult<T extends QueryOptions<any, any>> = Coalesce<
  ResultOf<T>,
  RowOf<T>
>;

type QueryDefinition<RawRow, TransformedRow> = {
  query: Sql;
  paginateBy?: string;
  filters?: Record<string, Record<string, (lhs: Sql, rhs: string) => Sql>>;
  map?: (row: RawRow) => TransformedRow;
};

export const defineQuery = <Raw, Transformed>({
  query,
  filters,
  paginateBy,
  map,
}: QueryDefinition<Raw, Transformed>) => ({
  query,

  paginateBy: paginateBy ?? 'id',

  map,

  async execute<Options extends QueryOptions<Raw, Transformed>>(
    conn: Connection,
    options: Options,
  ): Promise<{
    result: Transformed[];
    nextCursor: string | null;
  }> {
    const cursor = pipe(
      options.cursor,
      O.fromNullable,
      O.flatMap(flow(parseCursor, O.fromEither)),
      O.toNullable,
    );

    const q = sql`SELECT s.* FROM (`;
    q.append(query);
    q.append(sql`) s`);

    let orderCols: [string | number, 'desc' | 'asc'][] = [];

    if (cursor) {
      orderCols = Object.entries(cursor).map(([col, [, dir]]) => [col, dir]);
    } else {
      if (options.order) {
        orderCols = options.order;
      }

      if (orderCols.every(([col]) => col !== paginateBy)) {
        orderCols.push([this.paginateBy, 'desc']);
      }
    }

    const conditions = [];

    if (options.where) {
      conditions.push(options.where);
    }

    if (cursor) {
      const entries = Object.entries(cursor);

      const compare = ([[col, [val, dir]], ...rest]: [
        string,
        [any, 'asc' | 'desc'],
      ][]) => {
        const c = sql``;

        const escaped = sql.raw(conn.escapeIdentifier(col));

        // The following if-else-mess generates a different comparison expression
        // depending on the ordering and the nulliness of the cursorc value.
        // This complexity is required in order to handle NULLs correctly,
        // as they do not play well with the comparison operators (<, >, <=, >=).
        //
        // The permutations and the resulting SQL expressions are written out below:
        //
        // [desc, not null]: col IS NULL OR col < val [OR (col = val AND ...)]
        // [desc,     null]: col IS NULL [AND ...]
        // [ asc, not null]: col IS NOT NULL AND col > val [OR (col = val AND ...)]
        // [ asc,     null]: col IS NOT NULL [OR (col IS NULL AND ...)]

        if (dir === 'desc' && val !== null) {
          c.append(escaped);
          c.append(sql` IS NULL OR `);
          c.append(escaped);
          c.append(sql` < ${val}`);

          if (rest.length > 0) {
            c.append(sql` OR (`);
            c.append(escaped);
            c.append(sql` = ${val} AND (`);
            c.append(compare(rest));
            c.append(sql`))`);
          }
        } else if (dir === 'desc' && val === null) {
          c.append(escaped);
          c.append(sql` IS NULL`);

          if (rest.length > 0) {
            c.append(sql` AND (`);
            c.append(compare(rest));
            c.append(sql`)`);
          }
        } else if (dir === 'asc' && val !== null) {
          c.append(escaped);
          c.append(sql` IS NOT NULL AND `);
          c.append(escaped);
          c.append(sql` > ${val}`);

          if (rest.length > 0) {
            c.append(sql` OR (`);
            c.append(escaped);
            c.append(sql` = ${val} AND (`);
            c.append(compare(rest));
            c.append(sql`))`);
          }
        } else if (dir === 'asc' && val === null) {
          c.append(escaped);
          c.append(sql` IS NOT NULL`);

          if (rest.length > 0) {
            c.append(sql` OR (`);
            c.append(escaped);
            c.append(sql` IS NULL AND (`);
            c.append(compare(rest));
            c.append(sql`))`);
          }
        } else {
          throw new Error('Unreachable!');
        }

        return c;
      };

      if (entries.length > 0) {
        conditions.push(compare(entries));
      }
    }

    if (conditions.length > 0) {
      q.append(sql` WHERE `);

      conditions.forEach((condition, i) => {
        if (i > 0) {
          q.append(sql` AND `);
        }

        q.append(sql`(`)
          .append(condition)
          .append(sql`)`);
      });
    }

    if (orderCols) {
      q.append(sql` ORDER BY `);

      orderCols.forEach(([col, dir], i) => {
        if (i > 0) {
          q.append(sql`, `);
        }

        q.append(
          sql.raw(
            `${
              typeof col === 'string' ? conn.escapeIdentifier(col) : col
            } ${dir.toUpperCase()} NULLS ${dir === 'asc' ? 'FIRST' : 'LAST'}`,
          ),
        );
      });
    }

    if (options.limit !== undefined) {
      q.append(sql` LIMIT ${options.limit}`);
    }

    const rows = await conn.many<Record<string, any>>(q);

    const last = rows[rows.length - 1];

    const nextCursor =
      rows.length === options.limit
        ? serializeCursor(
            Object.fromEntries(
              orderCols.map(([col, dir]) => [col, [last[col], dir]]),
            ),
          )
        : null;

    let result;

    if (this.map) {
      result = (rows as Raw[]).map(this.map);

      return { result, nextCursor };
    } else {
      result = rows as Transformed[];

      return { result, nextCursor };
    }
  },

  middleware() {
    return Parser.query(paginationQuery);
  },

  handler<
    Request extends { pg: Connection; query: t.TypeOf<typeof paginationQuery> },
  >(mapper?: (req: Request) => QueryOptions<Raw, Transformed>) {
    const OPERATORS: Record<string, (lhs: Sql, rhs: Sql) => Sql> = {
      eq: (lhs, rhs) => sql`${lhs}::text = ${rhs}::text`,
      neq: (lhs, rhs) => sql`${lhs}::text <> ${rhs}::text`,
      gt: (lhs, rhs) => sql`${lhs} > ${rhs}`,
      lt: (lhs, rhs) => sql`${lhs} < ${rhs}`,
      gte: (lhs, rhs) => sql`${lhs} >= ${rhs}`,
      lte: (lhs, rhs) => sql`${lhs} <= ${rhs}`,
      like: (lhs, rhs) => sql`${lhs}::text ILIKE ('%' || ${rhs}::text || '%')`,
      in: (lhs, rhs) => sql`${lhs}::text = ANY (${String(rhs).split(',')})`,
      not_in: (lhs, rhs) =>
        sql`NOT (${lhs}::text = ANY (${String(rhs).split(',')}))`,
      is_null: (lhs, _rhs) => sql`${lhs} IS NULL`,
      is_not_null: (lhs, _rhs) => sql`${lhs} IS NOT NULL`,
    };

    return async (req: Request) => {
      const { query, pg } = req;

      const conditions = Object.entries(query.filter ?? {}).flatMap(
        ([column, conditions]) => {
          return Object.entries(conditions)
            .filter(([, value]) => value !== undefined)
            .map(([operator, value]) => {
              const op = filters?.[column]?.[operator] ?? OPERATORS[operator];

              if (!op) {
                throw new Error(`Unknown operator ${operator}`);
              }

              return sql`(${op(sql.raw(pg.escapeIdentifier(column)), value as any)})`;
            });
        },
      );

      const options = mapper?.(req) ?? {};

      if (options.where) {
        conditions.push(options.where);
      }

      const result = await this.execute(pg, {
        limit: query.limit,
        order: query.sort ? [[query.sort.column, query.sort.dir]] : undefined,
        cursor: query.cursor,
        ...options,
        where: conditions.length > 0 ? sql` AND `.join(conditions) : undefined,
      });

      return ok(result);
    };
  },
});

export const createPaginatedQuery =
  <Row>(query: Sql, paginateBy: string) =>
  async <Options extends QueryOptions<Row, any>>(
    conn: Connection,
    { where, map, limit, cursor: cursorStr, order }: Options,
  ): Promise<{
    result: Coalesce<ResultOf<Options>, Row>[];
    nextCursor: string | null;
  }> => {
    const cursor = pipe(
      cursorStr,
      O.fromNullable,
      O.flatMap(flow(parseCursor, O.fromEither)),
      O.toNullable,
    );

    const q = sql`SELECT s.* FROM (`;
    q.append(query);
    q.append(sql`) s`);

    let orderCols: [string | number, 'desc' | 'asc'][] = [];

    if (cursor) {
      orderCols = Object.entries(cursor).map(([col, [, dir]]) => [col, dir]);
    } else {
      if (order) {
        orderCols = order;
      }

      if (orderCols.every(([col]) => col !== paginateBy)) {
        orderCols.push([paginateBy, 'desc']);
      }
    }

    const conditions = [];

    if (where) {
      conditions.push(where);
    }

    if (cursor) {
      const entries = Object.entries(cursor);

      const compare = ([[col, [val, dir]], ...rest]: [
        string,
        [any, 'asc' | 'desc'],
      ][]) => {
        const c = sql``;

        const escaped = sql.raw(conn.escapeIdentifier(col));

        // The following if-else-mess generates a different comparison expression
        // depending on the ordering and the nulliness of the cursorc value.
        // This complexity is required in order to handle NULLs correctly,
        // as they do not play well with the comparison operators (<, >, <=, >=).
        //
        // The permutations and the resulting SQL expressions are written out below:
        //
        // [desc, not null]: col IS NULL OR col < val [OR (col = val AND ...)]
        // [desc,     null]: col IS NULL [AND ...]
        // [ asc, not null]: col IS NOT NULL AND col > val [OR (col = val AND ...)]
        // [ asc,     null]: col IS NOT NULL [OR (col IS NULL AND ...)]

        if (dir === 'desc' && val !== null) {
          c.append(escaped);
          c.append(sql` IS NULL OR `);
          c.append(escaped);
          c.append(sql` < ${val}`);

          if (rest.length > 0) {
            c.append(sql` OR (`);
            c.append(escaped);
            c.append(sql` = ${val} AND (`);
            c.append(compare(rest));
            c.append(sql`))`);
          }
        } else if (dir === 'desc' && val === null) {
          c.append(escaped);
          c.append(sql` IS NULL`);

          if (rest.length > 0) {
            c.append(sql` AND (`);
            c.append(compare(rest));
            c.append(sql`)`);
          }
        } else if (dir === 'asc' && val !== null) {
          c.append(escaped);
          c.append(sql` IS NOT NULL AND `);
          c.append(escaped);
          c.append(sql` > ${val}`);

          if (rest.length > 0) {
            c.append(sql` OR (`);
            c.append(escaped);
            c.append(sql` = ${val} AND (`);
            c.append(compare(rest));
            c.append(sql`))`);
          }
        } else if (dir === 'asc' && val === null) {
          c.append(escaped);
          c.append(sql` IS NOT NULL`);

          if (rest.length > 0) {
            c.append(sql` OR (`);
            c.append(escaped);
            c.append(sql` IS NULL AND (`);
            c.append(compare(rest));
            c.append(sql`))`);
          }
        } else {
          throw new Error('Unreachable!');
        }

        return c;
      };

      if (entries.length > 0) {
        conditions.push(compare(entries));
      }
    }

    if (conditions.length > 0) {
      q.append(sql` WHERE `);

      conditions.forEach((condition, i) => {
        if (i > 0) {
          q.append(sql` AND `);
        }

        q.append(sql`(`)
          .append(condition)
          .append(sql`)`);
      });
    }

    if (orderCols) {
      q.append(sql` ORDER BY `);

      orderCols.forEach(([col, dir], i) => {
        if (i > 0) {
          q.append(sql`, `);
        }

        q.append(
          sql.raw(
            `${
              typeof col === 'string' ? conn.escapeIdentifier(col) : col
            } ${dir.toUpperCase()} NULLS ${dir === 'asc' ? 'FIRST' : 'LAST'}`,
          ),
        );
      });
    }

    if (limit !== undefined) {
      q.append(sql` LIMIT ${limit}`);
    }

    const rows = await conn.many<Record<string, any>>(q);

    const last = rows[rows.length - 1];

    const nextCursor =
      rows.length === limit
        ? serializeCursor(
            Object.fromEntries(
              orderCols.map(([col, dir]) => [col, [last[col], dir]]),
            ),
          )
        : null;

    let result;

    if (map) {
      result = (rows as Row[]).map(map) as MappedResult<Options>[];

      return { result, nextCursor };
    } else {
      result = rows as MappedResult<Options>[];

      return { result, nextCursor };
    }
  };
