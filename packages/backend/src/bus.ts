import { Decode, Encode, Type, TypeOf } from 'io-ts';
import { flow, pipe } from 'fp-ts/lib/function';
import * as E from 'fp-ts/lib/Either';
import * as TE from 'fp-ts/lib/TaskEither';
import { Task } from 'fp-ts/lib/Task';
import { Middleware } from 'typera-express';

export type EventType<PT extends Type<any, any, any>> = {
  name: string;
  payloadType: PT;
};

export type EventOf<ET extends EventType<any>> = TypeOf<ET['payloadType']>;
export type PayloadOf<PT extends ProcedureType<any, any>> = TypeOf<
  PT['payloadType']
>;
export type ResponseOf<PT extends ProcedureType<any, any>> = TypeOf<
  PT['responseType']
>;
export type ProcedureArgs<PT extends ProcedureType<any, any>> =
  PayloadOf<PT> extends void ? [] : [PayloadOf<PT>];

export type EventArgs<ET extends EventType<any>> = EventOf<ET> extends void
  ? []
  : [EventOf<ET>];

export type EventHandler<T, C> = (
  payload: T,
  context: C,
  bus: ExecutionContext<C>,
) => Promise<void> | void;

export const defineEvent = <T extends Type<any, any, any>>(
  name: string,
  payloadType: T,
) => ({
  name,
  payloadType,
});

export const defineProcedure = <
  PT extends Type<any, any, any>,
  RT extends Type<any, any, any>,
>(options: {
  interfaceName: string;
  name: string;
  payload: PT;
  response: RT;
}) => ({
  name: options.name,
  interfaceName: options.interfaceName,
  payloadType: options.payload,
  responseType: options.response,
});

type Interface<
  Name extends string,
  Procedures extends Record<string, ProcedureType<any, any>>,
> = {
  name: Name;
  procedures: Procedures;
};

interface InterfaceBuilder<N extends string> {
  proc<
    PT extends Type<any, any, any>,
    RT extends Type<any, any, any>,
  >(options: {
    payload: PT;
    response: RT;
  }): Omit<ProcedureType<PT, RT, N>, 'name'>;
}

type InterfaceBuilderFn<
  N extends string,
  Procs extends Record<string, Omit<ProcedureType<any, any, N>, 'name'>>,
> = {
  (builder: InterfaceBuilder<N>): Procs;
};

type CreateInterfaceFn = {
  <
    N extends string,
    Procs extends Record<string, Omit<ProcedureType<any, any, N>, 'name'>>,
  >(
    name: N,
    builder: InterfaceBuilderFn<N, Procs>,
  ): Interface<
    N,
    { [K in keyof Procs]: K extends string ? Procs[K] & { name: K } : never }
  >;
};

type ProcedureImplementations<I extends Interface<any, any>, C> = {
  [P in keyof I['procedures']]: ProcedureHandler<I['procedures'][P], C>;
};

export const createInterface: CreateInterfaceFn = (name, builder) => {
  const procedures = builder({
    proc: ({ payload, response }) => ({
      payloadType: payload,
      responseType: response,
      interfaceName: name,
    }),
  });

  return {
    name,
    procedures: Object.fromEntries(
      Object.entries(procedures).map(([procName, def]) => [
        procName,
        { ...def, name: procName },
      ]),
    ) as any,
  };
};

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

export type ProcedureHandler<PT extends ProcedureType<any, any>, C> = (
  payload: PayloadOf<PT>,
  context: C,
  bus: ExecutionContext<C>,
) => Promise<ResponseOf<PT>>;

interface ProcedureHandlerWithOriginal<PT extends ProcedureType<any, any>, C>
  extends ProcedureHandler<PT, C> {
  original: ProcedureHandler<PT, C>;
}

export type ProcedureType<
  PT extends Type<any, unknown, any>,
  RT extends Type<any, unknown, any>,
  InterfaceName extends string = string,
  Name extends string = string,
> = {
  name: Name;
  interfaceName: InterfaceName;
  payloadType: PT;
  responseType: RT;
};

export abstract class ApplicationBus<C = void> {
  createContext(context: C): ExecutionContext<C> {
    return new ExecutionContext(this, context);
  }

  abstract on<ET extends EventType<any>>(
    eventType: ET,
    handler: EventHandler<EventOf<ET>, C>,
  ): void;

  abstract emit<ET extends EventType<any>>(
    ctx: C,
    eventType: ET,
    ...payload: EventArgs<ET>
  ): Promise<void>;
  /*abstract emit<ET extends EventType<any>>(
    ctx: C,
    eventType: ET,
    payload: EventOf<ET>,
  ): void;*/

  abstract exec<
    PT extends ProcedureType<PayloadType, ResponseType>,
    PayloadType extends Type<any, any, any>,
    ResponseType extends Type<any, any, any>,
  >(
    ctx: C,
    procedure: PT,
    id: string | null,
    ...payload: ProcedureArgs<PT>
  ): Promise<ResponseOf<PT>>;

  abstract register<
    PT extends ProcedureType<PayloadType, ResponseType>,
    PayloadType extends Type<any, any, any>,
    ResponseType extends Type<any, any, any>,
  >(procedure: PT, handler: ProcedureHandler<PT, C>): void;

  execT<
    PT extends ProcedureType<PayloadType, ResponseType>,
    PayloadType extends Type<any, any, any>,
    ResponseType extends Type<any, any, any>,
  >(
    ctx: C,
    procedure: PT,
  ): (...payload: ProcedureArgs<PT>) => Task<ResponseOf<PT>> {
    return (...payload: ProcedureArgs<PT>) =>
      () =>
        this.exec(ctx, procedure, null, ...payload);
  }
}

export class ExecutionContext<C> {
  constructor(
    private bus: ApplicationBus<C>,
    public context: C,
    private level: number = 0,
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

  execT<
    PT extends ProcedureType<PayloadType, ResponseType>,
    PayloadType extends Type<any, any, any>,
    ResponseType extends Type<any, any, any>,
  >(procedure: PT): (...payload: ProcedureArgs<PT>) => Task<ResponseOf<PT>> {
    return (...payload: ProcedureArgs<PT>) =>
      () =>
        this.exec(procedure, ...payload);
  }

  getInterface<I extends Interface<any, any>>(
    iface: I,
    id?: string,
  ): InterfaceHandle<I> {
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

type InterfaceHandleProc<P extends ProcedureType<any, any>> = (
  ...args: ProcedureArgs<P>
) => Promise<ResponseOf<P>>;

type InterfaceHandle<I extends Interface<any, any>> = {
  [P in keyof I['procedures']]: InterfaceHandleProc<I['procedures'][P]>;
};

export class LocalBus<C> extends ApplicationBus<C> {
  // private emitter = new EventEmitter();

  private procedures = new Map<string, ProcedureHandlerWithOriginal<any, C>>();
  private eventHandlers = new Map<string, Array<EventHandler<any, C>>>();

  protected getName<P extends ProcedureType<any, any>>(
    procedure: P,
    impl?: string,
  ): string {
    const name = impl
      ? `${procedure.interfaceName}:${impl}:${procedure.name}`
      : `${procedure.interfaceName}:${procedure.name}`;

    return name;
  }

  getHandler<P extends ProcedureType<any, any>>(
    proc: P,
  ): ProcedureHandler<any, C> {
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

  async emit<ET extends EventType<any>>(
    ctx: C,
    eventType: ET,
    ...payload: EventArgs<ET>
  ) {
    const handlers = this.eventHandlers.get(eventType.name) ?? [];
    // console.log(`Emitting ${eventType.name}: ${handlers.length} handlers`);
    await Promise.all(
      handlers.map(handler =>
        handler(payload[0], ctx, this.createContext(ctx)),
      ),
    );
    // this.emitter.emit(eventType.name, payload, ctx);
  }

  async exec<PT extends ProcedureType<any, any>>(
    ctx: C,
    procedure: PT,
    id: string | null,
    ...payload: ProcedureArgs<PT>
  ): Promise<ResponseOf<PT>> {
    const name = this.getName(procedure, id ?? undefined);

    // console.log(`Calling ${name}`);

    const handler = this.procedures.get(name);

    if (!handler) {
      throw new Error(`No handler for procedure call '${name}'.`);
    }

    const execHandler =
      (payload: PayloadOf<PT>): Task<unknown> =>
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

  provide<I extends Interface<any, any>>(
    iface: I,
    implementations: ProcedureImplementations<I, C>,
  ) {
    Object.entries(implementations).forEach(([name, impl]) =>
      this.register(iface.procedures[name], impl),
    );
  }

  provideNamed<I extends Interface<any, any>>(
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

    // console.log(`Registering ${name}`, new Error().stack);

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

  middleware(
    ctx: C,
  ): Middleware.Middleware<{ bus: ExecutionContext<C> }, never> {
    return async () => {
      return Middleware.next({
        bus: this.createContext(ctx),
      });
    };
  }
}
