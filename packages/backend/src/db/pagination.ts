import * as t from 'io-ts';
import sql, { SQLStatement } from 'sql-template-strings';
import { Connection } from './connection';
import { flow, pipe } from 'fp-ts/lib/function';
import * as O from 'fp-ts/Option';

const cursor = t.record(
  t.string,
  t.tuple([
    t.union([t.string, t.number]),
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
  const res = cursor.decode(json);

  console.log(res);

  return res;
};

type QueryOptions = {
  where?: SQLStatement;
  order?: Array<[string, 'desc' | 'asc']>;
  cursor?: string;
  limit?: number;
};

export const createPaginatedQuery =
  <T>(query: SQLStatement, paginateBy: string) =>
  async (
    conn: Connection,
    { where, limit, cursor: cursorStr, order }: QueryOptions,
  ): Promise<{ result: T[]; nextCursor: string | null }> => {
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
      const entries = Object.entries(cursor).filter(
        ([col]) => col !== paginateBy,
      );

      const lhsTuple = sql``;
      const rhsTuple = sql``;

      entries.forEach(([col, [val, dir]], i) => {
        if (i > 0) {
          lhsTuple.append(', ');
          rhsTuple.append(', ');
        }

        const [valueTuple, columnTuple] =
          dir === 'asc' ? [lhsTuple, rhsTuple] : [rhsTuple, lhsTuple];

        columnTuple.append(conn.escapeIdentifier(col));
        valueTuple.append(sql`${val}`);
      });

      const cond = sql``;

      const [val, dir] = cursor[paginateBy];

      if (entries.length > 0) {
        cond
          .append(lhsTuple)
          .append(' < ')
          .append(rhsTuple)
          .append(' OR (')
          .append(lhsTuple)
          .append(' = ')
          .append(rhsTuple)
          .append(' AND ');
      }

      cond
        .append(conn.escapeIdentifier(paginateBy))
        .append(dir === 'asc' ? ' > ' : ' < ')
        .append(sql`${val}`);

      if (entries.length > 0) {
        cond.append(')');
      }

      conditions.push(cond);
    }

    if (conditions.length > 0) {
      q.append(sql` WHERE `);

      conditions.forEach((condition, i) => {
        if (i > 0) {
          q.append(sql` AND `);
        }

        q.append('(').append(condition).append(')');
      });
    }

    if (orderCols) {
      q.append(' ORDER BY ');

      orderCols.forEach(([col, dir], i) => {
        if (i > 0) {
          q.append(', ');
        }

        q.append(
          `${
            typeof col === 'string' ? conn.escapeIdentifier(col) : col
          } ${dir.toUpperCase()}`,
        );
      });
    }

    if (limit !== undefined) {
      q.append(sql` LIMIT ${limit}`);
    }

    const rows = await conn.many<Record<string, any>>(q);

    const last = rows[rows.length - 1];

    return {
      result: rows as T[],
      nextCursor:
        rows.length === limit
          ? serializeCursor(
              Object.fromEntries(
                orderCols.map(([col, dir]) => [col, [last[col], dir]]),
              ),
            )
          : null,
    };
  };
