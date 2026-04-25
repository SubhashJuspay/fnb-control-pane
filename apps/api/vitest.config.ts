import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    pool: 'threads',
    testTimeout: 30_000,
    env: {
      DATABASE_URL: 'postgres://test:test@localhost:5433/test',
      AUTH_SECRET: 'test-secret-at-least-32-chars-xxxx',
      AUTH_URL: 'http://localhost:3000',
      SMTP_HOST: 'localhost',
      SMTP_PORT: '1025',
      EMAIL_FROM: 'test@example.com',
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
    },
    include: ['src/**/*.test.ts'],
  },
});
