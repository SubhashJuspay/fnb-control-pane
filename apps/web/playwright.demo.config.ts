import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config dedicated to recording the QR-to-pickup demo video against
 * the deployed Vercel frontend. Separate from the unit-style E2E config so it
 * doesn't bring up the local webServer pre-flight and so we can force
 * `video: 'on'` without slowing the rest of the suite down.
 *
 * Run it via `scripts/build-demo-video.sh` which orchestrates the test +
 * ffmpeg caption burn into a single mp4.
 */
export default defineConfig({
  testDir: './tests/demo',
  timeout: 6 * 60_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.DEMO_BASE_URL ?? 'https://fnb-control-panel.vercel.app',
    video: 'on',
    viewport: { width: 1440, height: 900 },
    // Slow each action down a touch so the recording is watchable rather
    // than feeling like a flashing slideshow.
    launchOptions: { slowMo: 120, headless: false },
    trace: 'off',
    screenshot: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
