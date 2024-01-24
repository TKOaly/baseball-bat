import { Encode, Encoder, Type, TypeOf } from 'io-ts';
import EventEmitter from 'eventemitter2';
import { flow, pipe } from 'fp-ts/lib/function';
import * as E from 'fp-ts/lib/Either';
import * as TE from 'fp-ts/lib/TaskEither';
import * as T from 'fp-ts/lib/Task';
import { Task } from 'fp-ts/lib/Task';

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

export type EventHandler<T> = (payload: T) => void;

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

export type ProcedureHandler<PT extends ProcedureType<any, any>> = (
  payload: PayloadOf<PT>,
) => Promise<ResponseOf<PT>>;

export type ProcedureType<
  PT extends Type<any, unknown, any>,
  RT extends Type<any, unknown, any>,
> = {
  name: string;
  payloadType: PT;
  responseType: RT;
};

export abstract class ApplicationBus {
  abstract on<ET extends EventType<any>>(
    eventType: ET,
    handler: EventHandler<EventOf<ET>>,
  ): void;
  abstract emit<ET extends EventType<any>>(
    eventType: ET,
    payload: EventOf<ET>,
  ): void;
  abstract exec<
    PT extends ProcedureType<PayloadType, ResponseType>,
    PayloadType extends Type<any, any, any>,
    ResponseType extends Type<any, any, any>,
  >(procedure: PT, ...payload: ProcedureArgs<PT>): Promise<ResponseOf<PT>>;
  abstract register<
    PT extends ProcedureType<PayloadType, ResponseType>,
    PayloadType extends Type<any, any, any>,
    ResponseType extends Type<any, any, any>,
  >(procedure: PT, handler: ProcedureHandler<PT>): void;

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

export class LocalBus extends ApplicationBus {
  private emitter = new EventEmitter();

  private procedures = new Map<string, ProcedureHandler<any>>();

  on<ET extends EventType<any>>(
    eventType: ET,
    handler: EventHandler<EventOf<ET>>,
  ) {
    const fn = flow(eventType.payloadType.decode, E.map(handler));

    this.emitter.on(eventType.name, fn);
  }

  emit<ET extends EventType<any>>(eventType: ET, payload: EventOf<ET>) {
    this.emitter.emit(eventType.name, payload);
  }

  async exec<PT extends ProcedureType<any, any>>(
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
        handler(payload);

    procedure.payloadType.encode;

    const encodePayload: Encode<any, PayloadOf<PT>> = procedure.payloadType
      .encode;

    const decodeResponse = flow(
      procedure.responseType.decode,
      E.mapLeft(validation => ({
        validation,
        message: `Failed to decode response for procedure call '${procedure.name}'.`,
      })),
    );

    const result = await pipe(
      payload[0],
      encodePayload,
      TE.of,
      TE.flatMapTask(execHandler),
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
  >(procedure: PT, handler: ProcedureHandler<PT>) {
    const fn = flow(
      procedure.payloadType.decode,
      TE.fromEither,
      TE.chain(p => () => handler(p)),
      a => a(),
    );

    this.procedures.set(procedure.name, fn);
  }
}
