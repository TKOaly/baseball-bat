import { Type, TypeOf } from 'io-ts';

export type EventType<PT extends Type<any, any, any>> = {
  name: string;
  payloadType: PT;
};

export type EventOf<ET extends EventType<any>> = TypeOf<ET['payloadType']>;

export type EventArgs<ET extends EventType<any>> = EventOf<ET> extends void
  ? []
  : [EventOf<ET>];

export const defineEvent = <T extends Type<any, any, any>>(
  name: string,
  payloadType: T,
) => ({
  name,
  payloadType,
});
