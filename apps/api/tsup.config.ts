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
  // Keep Prisma's runtime external — its generated client carries native
  // engine binaries that can't be cleanly bundled.
  external: ['@prisma/client'],
  // Inline every @repo workspace package. Without this, tsup leaves raw
  // `import { x } from "@repo/validation/foo"` lines in dist/server.js that
  // resolve to the workspace TS source at runtime. Node 24's strip-types
  // can read `.ts`, but the validation source files import siblings with
  // `.js` extensions (TS/ESM convention) that don't exist on disk, and
  // Node doesn't do `.js` → `.ts` substitution. Esbuild handles that
  // substitution during bundling, so inlining the @repo/* packages is
  // what makes `node dist/server.js` boot cleanly on Render.
  noExternal: [/^@repo\//],
});
