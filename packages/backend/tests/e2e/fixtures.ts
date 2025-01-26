import { Locator, Page, BrowserContext, test as base } from '@playwright/test';
import {
  Environment,
  TestEnvironment,
  createEnvironment,
  startServer,
} from '../common';
import { createPayerProfileFromTkoalyIdentity } from '@/modules/payers/definitions';
import { UpstreamUser, tkoalyIdentity } from '@bbat/common/types';
import { getUpstreamUserById } from '@/modules/users/definitions';
import { authenticateSession } from '@/auth-middleware';
import assert from 'node:assert';

type Fixtures = {
  bbat: E2ETestEnvironment;
};

export class E2ETestEnvironment extends TestEnvironment {
  constructor(
    public browser: BrowserContext,
    public page: Page,
    public url: string,
    public env: Environment,
  ) {
    super(env);
  }

  newPage(newPage: Page) {
    return new E2ETestEnvironment(this.browser, newPage, this.url, this.env);
  }

  getResourceField(label: string) {
    return this.page
      .locator('.resource-field-label', {
        hasText: new RegExp(`^${label}$`, 'i'),
      })
      .locator('..')
      .locator('.resource-field-content');
  }

  getResourceSection(title: string) {
    return this.page
      .locator('.resource-section')
      .filter({
        has: this.page.locator('.resource-section-title', { hasText: title }),
      })
      .locator('.resource-section-content');
  }

  getDialog(title?: string | RegExp) {
    if (!title) {
      return this.page.locator('.dialog-base');
    }

    return this.page.locator('.dialog-base').filter({
      has: this.page.locator('.dialog-header', { hasText: title }),
    });
  }

  async navigate(item: string) {
    await this.page.getByTestId('side-navigation').getByText(item).click();
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

    return await this.withContext(async ctx => {
      const payer = await ctx.exec(createPayerProfileFromTkoalyIdentity, {
        id: tkoalyIdentity(1234),
      });

      assert.ok(payer);

      const state = await this.browser.storageState();
      const { localStorage: ls } = state.origins.find(
        ({ origin }) => origin === this.url,
      )!;
      const sessionStr = ls.find(({ name }) => name === 'bbat-session')?.value;
      const session = sessionStr ? JSON.parse(sessionStr) : null;

      await ctx.exec(authenticateSession, {
        token: session.token,
        payerId: payer.id,
        method: 'test-runner',
      });

      return payer;
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
        this.page
          .locator(`[data-column="${column}"]`)
          .filter({ hasText: value }),
      );

    const row = this.root.getByRole('row').filter({ has: cell });

    return new Row(row);
  }

  row(i: number) {
    return new Row(this.rows().nth(i));
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

  async action(name: string | RegExp) {
    const trigger = this.locator.locator('.table-row-actions');
    await trigger.click();
    const menuId = await trigger.getAttribute('aria-controls');
    await this.page
      .locator(`[id='${menuId}']`)
      .getByRole('menuitem', { name })
      .click();
  }
}

export const test = base.extend<Fixtures>({
  async bbat({ page, context }, use) {
    const env = await createEnvironment();
    const url = await startServer(env);
    const testEnv = new E2ETestEnvironment(context, page, url, env);
    await use(testEnv);
    await env.teardown();
  },
});
