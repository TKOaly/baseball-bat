import { Locator, Page, test as base } from '@playwright/test';
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

export class E2ETestEnvironment extends TestEnvironment {
  constructor(
    public page: Page,
    public url: string,
    env: Environment,
  ) {
    super(env);
  }

  getResourceField(label: string) {
    return this.page
      .locator('.resource-field-label', {
        hasText: new RegExp(`^${label}$`, 'i'),
      })
      .locator('..')
      .locator('.resource-field-content');
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

  table(locator: Locator) {
    return new Table(locator);
  }
}

export class Table {
  constructor(private root: Locator) {}

  get page() {
    return this.root.page();
  }

  async rowCount() {
    return this.root.getByRole('row').count();
  }

  rows() {
    return this.root.getByRole('row');
  }

  getCellByValue(column: string, value: string) {
    return this.root
      .getByRole('cell')
      .and(
        this.root.locator(`[data-column="${column}"][data-value="${value}"]`),
      );
  }

  getRowByColumnValue(column: string, value: string) {
    const cell = this.page
      .getByRole('cell')
      .and(
        this.page.locator(`[data-column="${column}"][data-value="${value}"]`),
      );

    const row = this.root.getByRole('row').filter({ has: cell });

    return new Row(row);
  }
}

class Row {
  constructor(private locator: Locator) {}

  get page() {
    return this.locator.page();
  }

  async index() {
    const row = await this.locator.getAttribute('data-row');

    if (!row) {
      throw new Error('Row has no data-row attribute!');
    }

    return parseInt(row);
  }

  getCell(column: string) {
    return this.locator
      .getByRole('cell')
      .and(this.page.locator(`[data-column="${column}"]`));
  }

  click() {
    return this.locator.click();
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
