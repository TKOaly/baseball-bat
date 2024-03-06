import { SQLStatement } from 'sql-template-strings';
import pg from 'pg';

pg.types.setTypeParser(20, (value: string) => parseInt(value, 10));

export class Pool {
  protected pool: pg.Pool;

  constructor(url: string) {
    this.pool = new pg.Pool({
      max: 5,
      min: 0,
      connectionString: url,
    });
  }

  async connect() {
    return await Connection.from(this.pool);
  }

  async withConnection<T>(fn: (conn: Connection) => Promise<T>): Promise<T> {
    const conn = await this.connect();

    try {
      return await fn(conn);
    } finally {
      await conn.close();
    }
  }

  async tryWithConnection<T>(fn: (conn: Connection) => Promise<T>): Promise<T> {
    return this.withConnection(conn => conn.try(() => fn(conn)));
  }

  async end() {
    return this.pool.end();
  }
}

export class Connection {
  transactionCounter = 0;

  constructor(
    private id: number,
    private conn: pg.PoolClient,
  ) {}

  static async from(pool: pg.Pool) {
    const conn = await pool.connect();

    const result = await conn.query('SELECT pg_backend_pid() pid');
    const pid = result.rows[0].pid;

    await conn.query('BEGIN');

    return new Connection(pid, conn);
  }

  escapeIdentifier(id: string) {
    return this.conn.escapeIdentifier(id);
  }

  async commit() {
    await this.conn.query('COMMIT');
  }

  async rollback() {
    await this.conn.query('ROLLBACK');
  }

  async close() {
    await this.commit();
    this.conn.release();
  }

  async do(query: SQLStatement) {
    await this.many(query);
  }

  async one<A>(query: SQLStatement): Promise<A | null> {
    const results = await this.many<A>(query);

    if (results.length > 1) {
      throw new Error(`Query returned ${results.length} rows (1 expected)`);
    }

    return results[0] ?? null;
  }

  async many<T>(query: SQLStatement): Promise<T[]> {
    const { rows } = await this.conn.query(query);
    return rows;
  }

  async try<T>(fn: () => Promise<T>): Promise<T> {
    let success = true;

    const txid = this.transactionCounter++;
    const savepoint = `tx-${this.id}-${txid}`;

    await this.conn.query(`SAVEPOINT "${savepoint}"`);

    try {
      return await fn();
    } catch (err) {
      success = false;
      throw err;
    } finally {
      if (!success) {
        await this.conn.query(`ROLLBACK TO SAVEPOINT "${savepoint}"`);
      }
    }
  }
}
