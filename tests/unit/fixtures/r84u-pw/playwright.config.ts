// A config of one test that opens no browser, for tests/unit/r84u-predeploy.test.ts: predeploy's last line read over a
// real Playwright run that is not the whole suite (round eighty-four; outside review B12).
import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: '.', testMatch: /one\.spec\.ts$/, reporter: 'line', retries: 0 });
