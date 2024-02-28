import { RedisClientType } from 'redis';
import pg from 'pg';
import {
  ConnectionOptions,
  FlowJob,
  FlowProducer,
  Processor as BaseProcessor,
  Queue,
  WorkerOptions,
  Worker,
  Job,
  QueueEvents,
} from 'bullmq';
import { Config } from '../config';
import { ExecutionContext, LocalBus } from '@/bus';
import { BusContext } from '@/app';
// import { PoolConnection } from '@/db';
import { shutdown } from '@/orchestrator';
import { PoolConnection } from '@/db';

export type Processor<T = any, R = any, N extends string = string> = (
  bus: ExecutionContext<BusContext>,
  job: Job<T, R, N>,
  token?: string,
) => Promise<R>;

const logAllEvents = <EmitFn extends (...args: any[]) => any>(emitter: {
  emit: EmitFn;
}) => {
  const oldEmit = emitter.emit;

  emitter.emit = function (...args: Parameters<EmitFn>) {
    console.log('Event', ...args);
    oldEmit.apply(emitter, args);
  } as EmitFn;
};

export class JobService {
  queues: Record<string, Queue> = {};

  constructor(
    public config: Config,
    private redis: RedisClientType,
    private bus: LocalBus<BusContext>,
    private pool: pg.Pool,
  ) {
    const events = new QueueEvents('reports', {
      connection: this.getConnectionConfig(),
      prefix: 'bbat-jobs',
    });

    logAllEvents(events);

    bus.on(shutdown, () => events.close());
  }

  private getConnectionConfig(): ConnectionOptions {
    const url = new URL(this.config.redisUrl);

    return {
      host: url.host.split(':')[0],
      port: parseInt(url.port ?? '6379'),
      username: url.username,
      password: url.password,
    };
  }

  getQueue<D, T, N extends string>(name: string): Queue<D, T, N> {
    if (!this.queues[name]) {
      const queue = (this.queues[name] = new Queue(name, {
        connection: this.getConnectionConfig(),
        prefix: 'bbat-jobs',
      }));

      this.bus.on(shutdown, () => queue.close());
    }

    return this.queues[name] as any;
  }

  flowProducer: FlowProducer | null = null;

  getFlowProducer(): FlowProducer {
    if (this.flowProducer === null) {
      const producer = (this.flowProducer = new FlowProducer({
        connection: this.getConnectionConfig(),
        prefix: 'bbat-jobs',
      }));

      this.bus.on(shutdown, () => producer.close());
    }

    return this.flowProducer;
  }

  async createJob(definition: FlowJob) {
    const flow = await this.getFlowProducer().add({
      name: 'finish',
      queueName: 'main',
      children: [definition],
    });

    if (!flow.children) {
      throw new Error('Created job does not have children');
    }

    return flow.children[0];
  }

  async createWorker<T, R>(
    queue: string,
    processor: Processor<T, R>,
    options?: Omit<WorkerOptions, 'connection' | 'prefix'>,
  ) {
    const callback: BaseProcessor = async (job, token) => {
      const conn = await this.pool.connect();
      console.log('CONNECT!');

      await conn.query('BEGIN');

      const ctx = this.bus.createContext({ pg: new PoolConnection(conn) });

      let failed = false;

      try {
        return await processor(ctx, job, token);
      } catch (err) {
        failed = true;
        throw err;
      } finally {
        if (failed) {
          await conn.query('ROLLBACK');
        } else {
          await conn.query('COMMIT');
        }

        conn.release();
      }
    };

    const worker = new Worker(queue, callback, {
      ...options,
      connection: this.getConnectionConfig(),
      prefix: 'bbat-jobs',
    });

    this.bus.on(shutdown, async () => {
      await worker.close();
    });

    return worker;
  }

  async getJob(queueName: string, id: string) {
    const producer = this.getFlowProducer();
    const flow = await producer.getFlow({
      id,
      queueName,
      prefix: 'bbat-jobs',
      maxChildren: 1000,
    });

    return flow;
  }

  async getJobs() {
    const producer = this.getFlowProducer();
    const queue = this.getQueue('main');
    const jobs = await queue.getJobs(undefined);
    const flows = await Promise.all(
      jobs
        .flatMap(job => (job.id ? [job.id] : []))
        .map(id =>
          producer.getFlow({
            id,
            queueName: 'main',
            prefix: 'bbat-jobs',
            maxChildren: 10000,
          }),
        ),
    );

    return flows.flatMap(flow => (flow.children ? [flow.children[0]] : []));
  }
}
