import { Type } from 'io-ts';
import { ProcedureType } from './procedure';

export type Interface<
  Name extends string = string,
  Procedures extends Record<string, ProcedureType> = any,
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
