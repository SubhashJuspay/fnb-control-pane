/**
 * Print the GraphQL SDL produced by our Pothos schema to stdout. Used by the
 * web app's codegen pipeline to derive types without needing a running api +
 * database. Invoke with: `pnpm --filter @app/api exec tsx src/print-sdl.ts`.
 */
import { printSchema } from 'graphql';
import { buildSchema } from './schema/index.js';

const sdl = printSchema(buildSchema());
process.stdout.write(sdl);
