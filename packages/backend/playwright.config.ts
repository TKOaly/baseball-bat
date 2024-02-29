import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  use: {
    video: 'on',
    trace: 'on',
  },
});
