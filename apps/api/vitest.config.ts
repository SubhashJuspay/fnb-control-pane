import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Force a single resolution of `graphql` (it ships dual CJS/ESM and Pothos
// transitive deps can otherwise resolve a different copy in the worker pool,
// triggering "Cannot use GraphQLSchema from another module or realm").
const graphqlEsm = fileURLToPath(
  new URL(
    '../../node_modules/.pnpm/graphql@16.13.2/node_modules/graphql/index.mjs',
    import.meta.url,
  ),
);

// Testcontainers needs a DOCKER_HOST. Default Linux socket is missing on macOS;
// fall back to OrbStack or Docker Desktop sockets if present. Developers can
// override by setting DOCKER_HOST themselves.
function detectDockerHost(): string | undefined {
  if (process.env.DOCKER_HOST) return process.env.DOCKER_HOST;
  const candidates = [
    `${homedir()}/.orbstack/run/docker.sock`,
    `${homedir()}/.docker/run/docker.sock`,
    '/var/run/docker.sock',
  ];
  for (const path of candidates) {
    if (existsSync(path)) return `unix://${path}`;
  }
  return undefined;
}
const detectedDockerHost = detectDockerHost();

export default defineConfig({
  resolve: {
    alias: {
      graphql: graphqlEsm,
    },
  },
  test: {
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    testTimeout: 60_000,
    hookTimeout: 120_000,
    server: {
      deps: {
        // Inline graphql + all Pothos packages so vite's alias for `graphql`
        // applies inside transitive imports (Pothos imports `from 'graphql'`).
        // Without this Pothos's import is externalized and Node's ESM loader
        // creates a separate graphql module instance from the one used by
        // tests, triggering "Cannot use GraphQLSchema from another module".
        inline: [/^graphql(\/|$)/, /^@pothos\//],
      },
    },
    env: {
      DATABASE_URL: 'postgres://test:test@localhost:5433/test',
      AUTH_SECRET: 'test-secret-at-least-32-chars-xxxx',
      AUTH_URL: 'http://localhost:3000',
      SMTP_HOST: 'localhost',
      SMTP_PORT: '1025',
      EMAIL_FROM: 'test@example.com',
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      // Testcontainers config — only set if a Docker socket was found.
      ...(detectedDockerHost ? { DOCKER_HOST: detectedDockerHost } : {}),
      // OrbStack lacks the cgroup hooks Ryuk relies on; disabling avoids a
      // 30-second container start hang. Cleanup is still done in afterAll.
      TESTCONTAINERS_RYUK_DISABLED: 'true',
    },
    include: ['src/**/*.test.ts'],
  },
});
