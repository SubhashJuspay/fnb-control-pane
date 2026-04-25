import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    pool: 'threads',
    testTimeout: 30_000,
    env: {
      DATABASE_URL: 'postgres://test:test@localhost:5433/test',
    },
    include: ['src/**/*.test.ts'],
  },
});
