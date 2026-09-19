// The probe sweep, against the server the e2e config uses: npx playwright test --config tests/qa/playwright.config.ts
import { defineConfig } from '@playwright/test';
import base from '../../playwright.config';
export default defineConfig({ ...base, testDir: '.', testMatch: 'ui.probe.spec.ts', retries: 0 });
