import { execute, parse, type GraphQLSchema, type ExecutionResult } from 'graphql';
import { builder } from './builder.js';
import type { RequestContext } from '../context.js';

// Side-effect import to register error object types on the builder.
import '../errors.js';

// Register enums first so prismaObject `status` references resolve.
import './enums.js';

// Register domain modules so their Query/Mutation fields are present.
import './tenant.js';
import './location.js';
import './user.js';
import './membership.js';
import './viewer.js';
import './invitation.js';
import './audit.js';
import './category.js';
import './tax-category.js';
import './menu-item.js';
import './modifier.js';
import './menu.js';
import './ticket.js';
import './discount.js';
import './section.js';
import './table.js';
import './reservation.js';
import './mutations/create-location.js';
import './mutations/invite-staff.js';
import './mutations/accept-invitation.js';
import './mutations/revoke-membership.js';
import './mutations/revoke-invitation.js';
import './mutations/update-membership-role.js';
import './mutations/catalog/index.js';
import './mutations/menu/index.js';
import './mutations/location-overrides/index.js';
import './mutations/pos/index.js';
import './mutations/floor/index.js';
import './subscriptions/index.js';

export { builder };

export function buildSchema(): GraphQLSchema {
  return builder.toSchema();
}

// Re-exports of the canonical `graphql` runtime helpers used by the schema.
// Tests should import these from here (not directly from `'graphql'`) so they
// always share the same module instance as the schema itself. This avoids the
// "Cannot use GraphQLSchema from another module or realm" error that arises
// under vitest when graphql is loaded twice (CJS + ESM) via different paths.
export { execute, parse };
export type { ExecutionResult };

export async function runOperation(opts: {
  schema: GraphQLSchema;
  query: string;
  contextValue: RequestContext;
  variables?: Record<string, unknown>;
}): Promise<ExecutionResult> {
  return (await execute({
    schema: opts.schema,
    document: parse(opts.query),
    contextValue: opts.contextValue,
    variableValues: opts.variables,
  })) as ExecutionResult;
}
