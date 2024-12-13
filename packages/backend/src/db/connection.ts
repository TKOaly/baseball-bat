import opentelemetry from '@opentelemetry/api';
import {
  ATTR_DB_QUERY_TEXT,
  ATTR_DB_QUERY_PARAMETER,
} from '@opentelemetry/semantic-conventions/incubating';
import { Sql } from './template';
import pg, { Client } from 'pg';

pg.types.setTypeParser(20, (value: string) => parseInt(value, 10));

export class Pool {
  pool: pg.Pool;
  connections: Set<Connection> = new Set();

  constructor(url: string) {
    this.pool = new pg.Pool({
      max: 30,
      min: 0,
      connectionString: url,
    });
  }

  async connect() {
    return await Connection.from(this);
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
    await Promise.all([...this.connections].map(conn => conn.closed));
    return this.pool.end();
  }
}

export class Connection {
  transactionCounter = 0;

  onCommitHooks: Array<() => Promise<void>> = [];

  public closed: Promise<void>;
  private resolveClosed: () => void;
  private constructorStack?: string;

  constructor(
    public id: number,
    private conn: pg.ClientBase,
    private pool?: Pool,
  ) {
    this.constructorStack = new Error().stack;

    conn.on('error', this.onError);
    conn.on('end', this.onClose);

    this.closed = new Promise(resolve => {
      this.resolveClosed = resolve;
    });
  }

  onError = (err: unknown) => {
    console.log(
      `Connection error: ${err}\nCreated at: ${this.constructorStack}`,
    );
  };

  onClose = () => {
    if (this.pool) {
      this.pool.connections.delete(this);
    }

    this.conn.off('end', this.onClose);
    this.conn.off('error', this.onError);

    this.resolveClosed();
  };

  static async create(url: string) {
    const client = new pg.Client(url);
    await client.connect();

    const result = await client.query('SELECT pg_backend_pid() pid');
    const pid = result.rows[0].pid;
    await client.query('BEGIN');

    return new Connection(pid, client);
  }

  static async from(pool: Pool) {
    const client = await pool.pool.connect();

    const result = await client.query('SELECT pg_backend_pid() pid');
    const pid = result.rows[0].pid;

    await client.query('BEGIN');

    const conn = new Connection(pid, client, pool);
    pool.connections.add(conn);
    return conn;
  }

  get tracer() {
    return opentelemetry.trace.getTracer('baseball-bat');
  }

  escapeIdentifier(id: string) {
    return this.conn.escapeIdentifier(id);
  }

  async onCommit(hook: () => Promise<void>) {
    this.onCommitHooks.push(hook);
  }

  async commit() {
    await this.conn.query('COMMIT');
    await Promise.all(this.onCommitHooks.map(hook => hook()));
  }

  async rollback() {
    await this.conn.query('ROLLBACK');
  }

  async close() {
    await this.commit();

    if ('release' in this.conn && typeof this.conn.release === 'function') {
      this.conn.release();
    } else if (this.conn instanceof Client) {
      await this.conn.end();
    }

    this.onClose();
  }

  async do(query: Sql) {
    await this.many(query);
  }

  async query(query: Sql) {
    const attributes: Record<string, string | number> = {
      [ATTR_DB_QUERY_TEXT]: query.text,
    };

    query.values.forEach((value, index) => {
      attributes[ATTR_DB_QUERY_PARAMETER((index + 1).toString())] =
        typeof value === 'number' ? value : String(value);
    });

    return this.tracer.startActiveSpan('query', { attributes }, async span => {
      const result = await this.conn.query(query);
      span.end();
      return result;
    });
  }

  async one<A>(query: Sql): Promise<A | null> {
    const results = await this.many<A>(query);

    if (results.length > 1) {
      throw new Error(`Query returned ${results.length} rows (1 expected)`);
    }

    return results[0] ?? null;
  }

  async many<T>(query: Sql): Promise<T[]> {
    const { rows } = await this.query(query);
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
