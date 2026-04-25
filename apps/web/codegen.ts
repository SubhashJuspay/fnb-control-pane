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
  },
  ignoreNoDocuments: true,
};

export default config;
