import { Decode, Encode, Type, TypeOf } from 'io-ts';
import EventEmitter from 'eventemitter2';
import { flow, pipe } from 'fp-ts/lib/function';
import * as E from 'fp-ts/lib/Either';
import * as TE from 'fp-ts/lib/TaskEither';
import { Task } from 'fp-ts/lib/Task';
import { Middleware } from 'typera-express';

export type EventType<PT extends Type<any, any, any>> = {
  name: string | string[];
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

export type EventHandler<T, C> = (payload: T, context: C) => void;

export const defineEvent = <T extends Type<any, any, any>>(
  name: string | string[],
  payloadType: T,
) => ({
  name,
  payloadType,
});

export const defineProcedure = <
  PT extends Type<any, any, any>,
  RT extends Type<any, any, any>,
>(options: {
  name: string;
  payload: PT;
  response: RT;
}) => ({
  name: options.name,
  payloadType: options.payload,
  responseType: options.response,
});

export const createScope = (scope: string) => ({
  defineEvent<T extends Type<any, any, any>>(
    name: string | string[],
    payloadType: T,
  ) {
    return defineEvent(
      Array.isArray(name) ? [scope, ...name] : `${scope}:${name}`,
      payloadType,
    );
  },

  defineProcedure<
    PT extends Type<any, any, any>,
    RT extends Type<any, any, any>,
  >(options: { name: string; payload: PT; response: RT }) {
    return defineProcedure({
      ...options,
      name: `${scope}:${options.name}`,
    });
  },
});

export type ProcedureHandler<PT extends ProcedureType<any, any>, C> = (
  payload: PayloadOf<PT>,
  context: C,
  bus: ExecutionContext<C>,
) => Promise<ResponseOf<PT>>;

export type ProcedureType<
  PT extends Type<any, unknown, any>,
  RT extends Type<any, unknown, any>,
> = {
  name: string;
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
    payload: EventOf<ET>,
  ): void;

  abstract exec<
    PT extends ProcedureType<PayloadType, ResponseType>,
    PayloadType extends Type<any, any, any>,
    ResponseType extends Type<any, any, any>,
  >(
    ctx: C,
    procedure: PT,
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
        this.exec(ctx, procedure, ...payload);
  }
}

export class ExecutionContext<C> {
  constructor(
    private bus: ApplicationBus<C>,
    private context: C,
  ) {}

  emit<ET extends EventType<any>>(eventType: ET, payload: EventOf<ET>): void {
    this.bus.emit(this.context, eventType, payload);
  }

  exec<
    PT extends ProcedureType<PayloadType, ResponseType>,
    PayloadType extends Type<any, any, any>,
    ResponseType extends Type<any, any, any>,
  >(procedure: PT, ...payload: ProcedureArgs<PT>): Promise<ResponseOf<PT>> {
    return this.bus.exec(this.context, procedure, ...payload);
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
}

export class LocalBus<C> extends ApplicationBus<C> {
  private emitter = new EventEmitter();

  private procedures = new Map<string, ProcedureHandler<any, C>>();

  on<ET extends EventType<any>>(
    eventType: ET,
    handler: EventHandler<EventOf<ET>, C>,
  ) {
    const fn = (context: C) =>
      flow(
        eventType.payloadType.decode,
        E.map(payload => handler(payload, context)),
      );

    this.emitter.on(eventType.name, (event: unknown, context: C) =>
      fn(context)(event),
    );
  }

  emit<ET extends EventType<any>>(ctx: C, eventType: ET, payload: EventOf<ET>) {
    this.emitter.emit(eventType.name, payload, ctx);
  }

  async exec<PT extends ProcedureType<any, any>>(
    ctx: C,
    procedure: PT,
    ...payload: ProcedureArgs<PT>
  ): Promise<ResponseOf<PT>> {
    console.log(`Calling ${procedure.name}`);

    const handler = this.procedures.get(procedure.name);

    if (!handler) {
      throw new Error(`No handler for procedure call '${procedure.name}'.`);
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

  register<
    PT extends ProcedureType<PayloadType, ResponseType>,
    PayloadType extends Type<any, any, any>,
    ResponseType extends Type<any, any, any>,
  >(procedure: PT, handler: ProcedureHandler<PT, C>) {
    const fn = (payload: unknown, context: C) =>
      pipe(
        payload,
        procedure.payloadType.decode,
        TE.fromEither,
        TE.chain(p => () => handler(p, context, this.createContext(context))),
        a => a(),
      );

    this.procedures.set(procedure.name, fn);
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
