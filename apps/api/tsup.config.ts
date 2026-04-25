import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  target: 'node24',
  outDir: 'dist',
  sourcemap: true,
  clean: true,
  dts: false,
  splitting: false,
  shims: false,
  external: ['@prisma/client', '@repo/db'],
});
