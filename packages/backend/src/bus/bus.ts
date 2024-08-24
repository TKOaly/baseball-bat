import { EventArgs } from '@/bus';
import { EventOf, EventType, defineEvent } from './event';
import { Interface } from './interface';
import {
  PayloadOf,
  ProcedureArgs,
  ProcedureType,
  ResponseOf,
  defineProcedure,
} from './procedure';
import { Decode, Encode, Type } from 'io-ts';
import * as T from 'fp-ts/Task';
import * as TE from 'fp-ts/TaskEither';
import * as E from 'fp-ts/Either';
import { Middleware } from 'typera-express';
import { flow, pipe } from 'fp-ts/function';
import { setupNats } from '@/nats';
import { Config } from '@/config';
import { NatsConnection, RetentionPolicy } from 'nats';

type ProcedureImplementations<I extends Interface, C> = {
  [P in keyof I['procedures']]: ProcedureHandler<I['procedures'][P], C>;
};

type InterfaceHandleProc<P extends ProcedureType> = (
  ...args: ProcedureArgs<P>
) => Promise<ResponseOf<P>>;

type InterfaceHandle<I extends Interface> = {
  [P in keyof I['procedures']]: InterfaceHandleProc<I['procedures'][P]>;
};

export type EventHandler<T, C> = (
  payload: T,
  context: C,
  bus: ExecutionContext<C>,
) => Promise<void> | void;

export class ExecutionContext<C> {
  constructor(
    private bus: LocalBus<C>,
    public context: C,
  ) {}

  emit<ET extends EventType<any>>(
    eventType: ET,
    ...payload: EventArgs<ET>
  ): Promise<void> {
    return this.bus.emit(this.context, eventType, ...payload);
  }

  on<ET extends EventType<any>>(
    eventType: ET,
    handler: EventHandler<EventOf<ET>, C>,
  ): void {
    this.bus.on(eventType, handler);
  }

  exec<
    PT extends ProcedureType<PayloadType, ResponseType>,
    PayloadType extends Type<any, any, any>,
    ResponseType extends Type<any, any, any>,
  >(procedure: PT, ...payload: ProcedureArgs<PT>): Promise<ResponseOf<PT>> {
    return this.bus.exec(this.context, procedure, null, ...payload);
  }

  execSpecific<
    PT extends ProcedureType<PayloadType, ResponseType>,
    PayloadType extends Type<any, any, any>,
    ResponseType extends Type<any, any, any>,
  >(
    procedure: PT,
    id: string,
    ...payload: ProcedureArgs<PT>
  ): Promise<ResponseOf<PT>> {
    return this.bus.exec(this.context, procedure, id, ...payload);
  }

  execTE<
    PT extends ProcedureType<PayloadType, ResponseType>,
    PayloadType extends Type<any, any, any>,
    ResponseType extends Type<any, any, any>,
  >(
    procedure: PT,
  ): (...payload: ProcedureArgs<PT>) => TE.TaskEither<Error, ResponseOf<PT>> {
    return (...payload: ProcedureArgs<PT>) =>
      TE.tryCatch(
        () => this.exec(procedure, ...payload),
        e => e as Error,
      );
  }

  execT<
    PT extends ProcedureType<PayloadType, ResponseType>,
    PayloadType extends Type<any, any, any>,
    ResponseType extends Type<any, any, any>,
  >(procedure: PT): (...payload: ProcedureArgs<PT>) => T.Task<ResponseOf<PT>> {
    return (...payload: ProcedureArgs<PT>) =>
      () =>
        this.exec(procedure, ...payload);
  }

  getInterface<I extends Interface>(iface: I, id?: string): InterfaceHandle<I> {
    return new Proxy(
      {},
      {
        get: (_target, prop) => {
          const proc = iface.procedures[prop];

          if (!proc) {
            throw new Error('No such procedure!');
          }

          if (id) {
            return (...args: any) => this.execSpecific(proc, id, ...args);
          }

          return (...args: any) => this.exec(proc, ...args);
        },
      },
    ) as any;
  }
}

export type ProcedureHandler<PT extends ProcedureType, C> = (
  payload: PayloadOf<PT>,
  context: C,
  bus: ExecutionContext<C>,
) => Promise<ResponseOf<PT>>;

interface ProcedureHandlerWithOriginal<PT extends ProcedureType, C>
  extends ProcedureHandler<PT, C> {
  original: ProcedureHandler<PT, C>;
}

export class LocalBus<C> {
  // private emitter = new EventEmitter();

  private procedures = new Map<string, ProcedureHandlerWithOriginal<any, C>>();
  private eventHandlers = new Map<string, Array<EventHandler<any, C>>>();

  constructor(private nats: NatsConnection) {}

  static async create<C2>(config: Config): Promise<LocalBus<C2>> {
    const nats = await setupNats(config);

    const jsm = await nats.jetstreamManager();

    await jsm.streams.add({
      name: 'bbat',
      subjects: ['bbat.>']
    });

    return new LocalBus(nats);
  }

  protected getName<P extends ProcedureType>(
    procedure: P,
    impl?: string,
  ): string {
    const name = impl
      ? `${procedure.interfaceName}:${impl}:${procedure.name}`
      : `${procedure.interfaceName}:${procedure.name}`;

    return name;
  }

  getHandler<P extends ProcedureType>(proc: P): ProcedureHandler<any, C> {
    const name = this.getName(proc);
    return this.procedures.get(name)!.original; // eslint-disable-line
  }

  on<ET extends EventType<any>>(
    eventType: ET,
    handler: EventHandler<EventOf<ET>, C>,
  ) {
    const fn = async (event: unknown, context: C) => {
      const payload = eventType.payloadType.decode(event);

      if (E.isRight(payload)) {
        await handler(payload.right, context, this.createContext(context));
      } else {
        console.log(event);
        throw new Error(
          'Failed to decode payload for event ${eventType.name}!',
        );
      }
    };

    if (!this.eventHandlers.has(eventType.name)) {
      this.eventHandlers.set(eventType.name, [fn]);
    } else {
      this.eventHandlers.get(eventType.name)?.push(fn);
    }
  }

  async emit<ET extends EventType<PT>, PT extends Type<any, any, any>>(
    ctx: C,
    eventType: ET,
    ...payload: EventArgs<ET>
  ) {
    const handlers = this.eventHandlers.get(eventType.name) ?? [];

    await Promise.all(
      handlers.map(handler =>
        handler(payload[0], ctx, this.createContext(ctx)),
      ),
    );

    const js = this.nats.jetstream();

    const output = eventType.payloadType.encode(payload[0]);
    const encoded = output ? new TextEncoder().encode(JSON.stringify(output)) : undefined;
    await js.publish(`bbat.${eventType.name.replace(':', '.')}`, encoded);
  }

  async exec<PT extends ProcedureType>(
    ctx: C,
    procedure: PT,
    id: string | null,
    ...payload: ProcedureArgs<PT>
  ): Promise<ResponseOf<PT>> {
    const name = this.getName(procedure, id ?? undefined);

    const handler = this.procedures.get(name);

    if (!handler) {
      throw new Error(`No handler for procedure call '${name}'.`);
    }

    const execHandler =
      (payload: PayloadOf<PT>): T.Task<unknown> =>
      () =>
        handler(payload, ctx, this.createContext(ctx));

    const responseType = procedure.responseType as Type<
      PayloadOf<PT>,
      unknown,
      unknown
    >;
    const encodePayload: Encode<PayloadOf<PT>, unknown> = procedure.payloadType
      .encode;
    const decodePayload: Decode<any, PayloadOf<PT>> = procedure.payloadType
      .decode;

    const decodeResponse = flow(
      procedure.responseType.decode as Decode<unknown, ResponseOf<PT>>,
      E.mapLeft(validation => ({
        validation,
        message: `Failed to decode response for procedure call '${procedure.name}'.`,
      })),
    );

    const result = await pipe(
      payload[0],
      encodePayload,
      flow(
        decodePayload,
        E.mapLeft(validation => ({
          validation,
          message: `Failed to decode payload for procedure call '${procedure.name}'.`,
          payload,
        })),
      ),
      TE.fromEither,
      TE.flatMapTask(execHandler),
      TE.map(value => {
        if (!responseType.is(value)) {
          console.log(value, responseType.name);
        }

        return value;
      }),
      TE.map(procedure.responseType.encode),
      TE.flatMapEither(decodeResponse),
    )();

    if (E.isLeft(result)) {
      console.log(result.left);
      throw new Error(result.left.message);
    }

    return result.right;
  }

  provide<I extends Interface>(
    iface: I,
    implementations: ProcedureImplementations<I, C>,
  ) {
    Object.entries(implementations).forEach(([name, impl]) =>
      this.register(iface.procedures[name], impl),
    );
  }

  provideNamed<I extends Interface>(
    iface: I,
    id: string | null,
    implementations: ProcedureImplementations<I, C>,
  ) {
    Object.entries(implementations).forEach(([name, impl]) =>
      this.register(iface.procedures[name], impl, id ?? undefined),
    );
  }

  register<
    PT extends ProcedureType<PayloadType, ResponseType>,
    PayloadType extends Type<any, any, any>,
    ResponseType extends Type<any, any, any>,
  >(
    procedure: PT,
    handler: ProcedureHandler<PT, C>,
    ifaceId?: string,
    override?: boolean,
  ) {
    const name = this.getName(procedure, ifaceId);

    if (!override && this.procedures.has(name)) {
      throw new Error(`Handler for procedure ${name} already defined!`);
    }

    const fn = (payload: unknown, context: C) =>
      pipe(
        payload,
        procedure.payloadType.decode,
        TE.fromEither,
        TE.chain(p => () => handler(p, context, this.createContext(context))),
        a => a(),
      );

    fn.original = handler;

    this.procedures.set(name, fn);
  }

  middleware<R>(
    ctx: (req: R) => C,
  ): Middleware.ChainedMiddleware<R, { bus: ExecutionContext<C> }, never> {
    return async req => {
      return Middleware.next({
        bus: this.createContext(ctx(req)),
      });
    };
  }

  createContext(context: C): ExecutionContext<C> {
    return new ExecutionContext(this, context);
  }
}

export const createScope = (scope: string) => ({
  defineEvent<T extends Type<any, any, any>>(
    name: string | string[],
    payloadType: T,
  ) {
    return defineEvent(`${scope}:${name}`, payloadType);
  },

  defineProcedure<
    PT extends Type<any, any, any>,
    RT extends Type<any, any, any>,
  >(options: { name: string; payload: PT; response: RT }) {
    return defineProcedure({
      ...options,
      interfaceName: scope,
      name: options.name,
    });
  },
});
