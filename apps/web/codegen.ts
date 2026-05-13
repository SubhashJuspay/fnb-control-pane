import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  overwrite: true,
  schema: process.env.CODEGEN_SCHEMA_URL ?? 'lib/graphql/schema.graphql',
  documents: [
    'lib/graphql/operations/**/*.graphql',
    'app/**/*.tsx',
    'app/**/*.ts',
    'components/**/*.tsx',
    'lib/**/*.tsx',
    'lib/**/*.ts',
    '!lib/graphql/generated/**/*',
  ],
  generates: {
    'lib/graphql/generated/': {
      preset: 'client',
      plugins: [],
      config: {
        useTypeImports: true,
      },
    },
    // Snapshot the SDL to disk whenever codegen is run against a live API.
    // This file is what Vercel reads at build time, so committing it after
    // any schema change is mandatory. When CODEGEN_SCHEMA_URL is unset the
    // snapshot is its own source — this output is a no-op write of the same
    // file we read from, which graphql-codegen handles gracefully.
    'lib/graphql/schema.graphql': {
      plugins: ['schema-ast'],
      config: {
        includeDirectives: true,
      },
    },
  },
  ignoreNoDocuments: true,
};

export default config;
