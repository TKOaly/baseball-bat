import type { BusContext } from '@/app';
import { ExecutionContext, LocalBus } from '@/bus';
import { describe, test } from 'node:test';

import {
  Environment,
  TestEnvironment,
  createEnvironment,
  startServer,
} from '../common';

interface CustomTestHandler {
  (ctx: UnitTestEnvironment): Promise<void> | void;
}

interface CustomTestFn {
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

class UnitTestEnvironment extends TestEnvironment {
  public bus!: ExecutionContext<BusContext>;
  public busRoot!: LocalBus<BusContext>;

  constructor(
    public t: TestContext,
    env: Environment,
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
          await startServer(env);
          const testEnv = new UnitTestEnvironment(t, env);
          testEnv.busRoot = await testEnv.env.get('bus');
          await testEnv.withContext(async ctx => {
            testEnv.bus = ctx;
            await fn(testEnv);
          });
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
