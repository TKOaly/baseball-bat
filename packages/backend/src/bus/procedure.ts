import { Type, TypeOf } from 'io-ts';

export type ProcedureType<
  PT extends Type<any, unknown, any> = any,
  RT extends Type<any, unknown, any> = any,
  InterfaceName extends string = string,
  Name extends string = string,
> = {
  name: Name;
  interfaceName: InterfaceName;
  payloadType: PT;
  responseType: RT;
};

export type PayloadOf<PT extends ProcedureType<any, any>> = TypeOf<
  PT['payloadType']
>;
export type ResponseOf<PT extends ProcedureType<any, any>> = TypeOf<
  PT['responseType']
>;
export type ProcedureArgs<PT extends ProcedureType<any, any>> =
  PayloadOf<PT> extends void ? [] : [PayloadOf<PT>];

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
