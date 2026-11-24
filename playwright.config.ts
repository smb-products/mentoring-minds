import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

/**
 * Browser tests for the wiring tickets (docs/WIRING.md). They drive a real production
 * build signed in as real users, against their own database (E2E_DATABASE_URL, name
 * must contain "test"). Each spec file starts from a fresh copy of the demo data.
 *
 *   npm run build:e2e     once, and after changing code (a build with DEMO_MODE=false)
 *   npm run test:e2e      everything that's switched on
 *   npm run test:e2e -- w4                one ticket
 *   npm run test:e2e -- --headed w6       watch it
 *
 * Areas still on the mock are skipped, with the reason. tests/e2e/README.md has more.
 */
if (existsSync('.env')) process.loadEnvFile('.env');

const PORT = Number(process.env.E2E_PORT ?? 3200);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;
const E2E_DATABASE_URL = process.env.E2E_DATABASE_URL ?? 'postgresql://postgres@localhost:5432/mm_e2e_test';
process.env.E2E_DATABASE_URL = E2E_DATABASE_URL;
const chrome = process.env.E2E_CHROME_PATH; // optional: use an installed Chrome instead of Playwright's

export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  // One database, one server: specs run one at a time.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL,
    timezoneId: 'America/New_York',
    locale: 'en-US',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...(chrome && { launchOptions: { executablePath: chrome } }),
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    // Parents mostly use phones: specs tagged @phone run here too.
    { name: 'phone', grep: /@phone/, use: { ...devices['Pixel 7'] } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npx next start -p ${PORT}`,
        url: `${baseURL}/sign-in`,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
        env: {
          DATABASE_URL: E2E_DATABASE_URL,
          DIRECT_URL: E2E_DATABASE_URL,
          DEMO_MODE: 'false',
          ALLOW_LOCAL_UPLOADS: 'true',
          BLOB_READ_WRITE_TOKEN: '',
          AUTH_TRUST_HOST: 'true',
        },
      },
});
