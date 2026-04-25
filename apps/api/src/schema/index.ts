import type { GraphQLSchema } from 'graphql';
import { builder } from './builder.js';

// Side-effect import to register error object types on the builder.
import '../errors.js';

export { builder };

export function buildSchema(): GraphQLSchema {
  return builder.toSchema();
}
