import type { BusContext } from '@/app';
import { ExecutionContext, LocalBus } from '@/bus';
import { describe, test } from 'node:test';

import {
  Environment,
  TestEnvironment,
  createEnvironment,
  startServer,
} from '../common';
import { createPayerProfileFromTkoalyIdentity } from '@/modules/payers/definitions';
import { tkoalyIdentity } from '@bbat/common/types';
import { getUpstreamUserById } from '@/modules/users/definitions';

export interface CustomTestHandler {
  (ctx: UnitTestEnvironment): Promise<void> | void;
}

export interface CustomTestFn {
  (name: string, test: CustomTestHandler): void;
  only(name: string, test: CustomTestHandler): void;
}

interface CustomSuiteContext {
  test: CustomTestFn;
}

interface CustomSuiteFn {
  (ctx: CustomSuiteContext): void;
}

type TestFn = NonNullable<Parameters<typeof test>[0]>;
type TestContext = Parameters<TestFn>[0];

export class UnitTestEnvironment extends TestEnvironment {
  public bus!: ExecutionContext<BusContext>;
  public busRoot!: LocalBus<BusContext>;
  public withNewContext!: <T>(
    fn: (ctx: UnitTestEnvironment) => Promise<T> | T,
  ) => Promise<T>;

  constructor(
    public t: TestContext,
    public env: Environment,
    public url: string,
  ) {
    super(env);
  }
}

export default (name: string, callback: CustomSuiteFn) =>
  describe(name, () => {
    const wrap: (fn: CustomTestHandler) => TestFn =
      fn => async (t: TestContext) => {
        const env = await createEnvironment();
        try {
          const url = await startServer(env);
          const testEnv = new UnitTestEnvironment(t, env, url);
          testEnv.busRoot = await testEnv.env.get('bus');

          await testEnv.mockProcedure(
            getUpstreamUserById,
            async ({ id }) => {
              return {
                id,
                screenName: 'Teppo Testaaja',
                email: 'admin@test.test',
                username: 'test',
                role: 'kayttaja' as const,
              };
            },
            {
              times: 1,
            },
          );

          const payer = await testEnv.withContext(bus =>
            bus.exec(createPayerProfileFromTkoalyIdentity, {
              id: tkoalyIdentity(0),
            }),
          );

          if (!payer) {
            throw new Error('Failed to create user!');
          }

          const _withContext = <T>(
            fn: (ctx: UnitTestEnvironment) => Promise<T> | T,
          ) =>
            testEnv.withContext(async ctx => {
              testEnv.bus = ctx;
              testEnv.withNewContext = _withContext;
              return await fn(testEnv);
            }, payer.id.value);

          await _withContext(fn);
        } finally {
          await env.teardown();
        }
      };

    const customTest: CustomTestFn = (name, fn) => test(name, wrap(fn));
    customTest.only = (name, fn) => test.only(name, wrap(fn));

    const context: CustomSuiteContext = {
      test: customTest,
    };

    callback(context);
  });
