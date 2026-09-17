import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/e2e',
  webServer: { command: 'npm run build && npx wrangler dev --port 4173', port: 4173, reuseExistingServer: true, timeout: 180000 },
  use: { baseURL: 'http://127.0.0.1:4173', launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {} }
});
