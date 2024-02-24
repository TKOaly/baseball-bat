import { Page, test as base } from '@playwright/test';
import {
  Environment,
  TestEnvironment,
  createEnvironment,
  startServer,
  startServices,
} from '../common';
import { createPayerProfileFromTkoalyIdentity } from '@/services/payers/definitions';
import { UpstreamUser, tkoalyIdentity } from '@bbat/common/types';
import { getUpstreamUserById } from '@/services/users/definitions';
import { authenticateSession } from '@/auth-middleware';
import assert from 'node:assert';

type Fixtures = {
  bbat: E2ETestEnvironment;
};

class E2ETestEnvironment extends TestEnvironment {
  constructor(
    private page: Page,
    public url: string,
    env: Environment,
  ) {
    super(env);
  }

  async login(user: Partial<UpstreamUser>) {
    await this.mockProcedure(
      getUpstreamUserById,
      async ({ id }) => ({
        id,
        username: 'test',
        email: 'test@test.test',
        screenName: 'Teppo Testaaja',
        role: 'yllapitaja' as const,
        ...user,
      }),
      { times: 2 },
    );

    await this.withContext(async ctx => {
      const payer = await ctx.exec(createPayerProfileFromTkoalyIdentity, {
        id: tkoalyIdentity(1234),
        token: 'TEST-TOKEN',
      });

      assert.ok(payer);

      const token = await this.page.evaluate(() =>
        localStorage.getItem('session-token'),
      );

      assert.ok(token);

      await ctx.exec(authenticateSession, {
        token,
        payerId: payer.id,
        method: 'test-runner',
        userServiceToken: 'TEST-TOKEN',
      });
    });
  }
}

export const test = base.extend<Fixtures>({
  async bbat({ page }, use) {
    const env = await createEnvironment();
    await startServices(env);
    const url = await startServer(env);
    const testEnv = new E2ETestEnvironment(page, url, env);
    await use(testEnv);
    await env.teardown();
  },
});
