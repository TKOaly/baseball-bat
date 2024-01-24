import { RedisClientType } from 'redis';
import {
  ConnectionOptions,
  FlowJob,
  FlowProducer,
  Processor,
  Queue,
  QueueEvents,
  Worker,
  WorkerOptions,
} from 'bullmq';
import { Config } from '../config';
import process from 'process';

export class JobService {
  queues: Record<string, Queue> = {};

  constructor(
    public config: Config,
    private redis: RedisClientType,
  ) {
    const events = new QueueEvents('main', {
      connection: this.getConnectionConfig(),
      prefix: 'bbat-jobs',
    });

    process.on('exit', () => events.close());
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

      process.on('exit', () => queue.close());
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

      process.on('exit', () => producer.close());
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

  createWorker(
    queue: string,
    callback: Processor,
    options?: Omit<WorkerOptions, 'connection' | 'prefix'>,
  ) {
    const worker = new Worker(queue, callback, {
      ...options,
      connection: this.getConnectionConfig(),
      prefix: 'bbat-jobs',
    });
    process.on('exit', () => worker.close());
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
