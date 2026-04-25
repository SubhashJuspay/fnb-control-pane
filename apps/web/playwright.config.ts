import { defineConfig, devices } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Load the repo-root `.env` so DATABASE_URL is available to Prisma when the
 * E2E suite runs from `apps/web`. Node 24 has a built-in `--env-file` flag,
 * but Playwright invokes us without it; doing this here keeps the dev UX
 * "just works" as long as `.env` exists.
 */
function loadRootEnv(): void {
  try {
    const envPath = resolve(__dirname, '..', '..', '.env');
    const text = readFileSync(envPath, 'utf8');
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq < 0) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    // .env is optional — tests will fail loudly later if vars are missing.
  }
}

loadRootEnv();

/**
 * Playwright config for Foundation E2E tests.
 *
 * The suite assumes the developer has run `docker compose up` (web, api,
 * Postgres, MailHog) and `pnpm db:seed` before running E2E. The webServer
 * config below just waits for the web app to be reachable. CI will start
 * docker-compose explicitly (Wave 5b).
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false, // tests share a database; run sequentially for safety
  workers: 1, // single worker because resetTestData() truncates global state
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.PLAYWRIGHT_NO_WEBSERVER
    ? undefined
    : {
        // Assume the docker compose stack is already running.
        // For developer convenience: this command is a no-op that succeeds
        // when /sign-in is reachable.
        command:
          'node -e "(async () => { for (let i = 0; i < 60; i++) { try { const r = await fetch(\\"http://localhost:3000/sign-in\\"); if (r.ok || r.status === 200) process.exit(0); } catch {} await new Promise(r => setTimeout(r, 1000)); } process.exit(1); })()"',
        url: 'http://localhost:3000/sign-in',
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
