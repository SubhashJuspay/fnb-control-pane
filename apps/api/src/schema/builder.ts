import SchemaBuilder from '@pothos/core';
import DataloaderPlugin from '@pothos/plugin-dataloader';
import ErrorsPlugin from '@pothos/plugin-errors';
import PrismaPlugin from '@pothos/plugin-prisma';
import RelayPlugin from '@pothos/plugin-relay';
import ScopeAuthPlugin from '@pothos/plugin-scope-auth';
import ZodPlugin from '@pothos/plugin-zod';
import type { Role } from '@repo/db';
import { DateTimeResolver, JSONResolver } from 'graphql-scalars';
import { prisma } from '../prisma.js';
import type { RequestContext } from '../context.js';
import type PrismaTypes from './prisma-types.js';
import { getDatamodel } from './prisma-types.js';

export const builder = new SchemaBuilder<{
  PrismaTypes: PrismaTypes;
  Context: RequestContext;
  Scalars: {
    DateTime: { Input: Date; Output: Date };
    JSON: { Input: unknown; Output: unknown };
    UUID: { Input: string; Output: string };
  };
  AuthScopes: {
    authenticated: boolean;
    owner: boolean;
    admin: boolean;
    manager: boolean;
    staff: boolean;
  };
}>({
  plugins: [
    ErrorsPlugin,
    ScopeAuthPlugin,
    PrismaPlugin,
    RelayPlugin,
    DataloaderPlugin,
    ZodPlugin,
  ],
  prisma: {
    client: prisma,
    dmmf: getDatamodel(),
    exposeDescriptions: true,
    filterConnectionTotalCount: true,
  },
  relay: {},
  scopeAuth: {
    authScopes: async (ctx) => {
      const auth = ctx.auth;
      if (auth.kind !== 'authenticated') {
        // The viewer / location-switcher path runs BEFORE a tenant has been
        // chosen and therefore lands here. We still consider that caller
        // `authenticated` (so they can read their own Membership rows on
        // the Viewer type) but never grant role-scoped permissions without
        // a resolved tenant.
        const sideChannelUserId = (
          ctx as unknown as { __userId?: string }
        ).__userId;
        return {
          authenticated: typeof sideChannelUserId === 'string' && sideChannelUserId.length > 0,
          owner: false,
          admin: false,
          manager: false,
          staff: false,
        };
      }
      const r: Role = auth.role;
      const inSet = (allowed: Role[]): boolean => allowed.includes(r);
      return {
        authenticated: true,
        owner: inSet(['OWNER']),
        admin: inSet(['OWNER', 'ADMIN']),
        manager: inSet(['OWNER', 'ADMIN', 'MANAGER']),
        staff: inSet(['OWNER', 'ADMIN', 'MANAGER', 'STAFF']),
      };
    },
  },
  errors: { defaultTypes: [] },
});

builder.addScalarType('DateTime', DateTimeResolver);
builder.addScalarType('JSON', JSONResolver);
builder.scalarType('UUID', {
  serialize: (v) => v as string,
  parseValue: (v) => {
    if (
      typeof v !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
    ) {
      throw new Error('Invalid UUID');
    }
    return v;
  },
});

// Initialize Query/Mutation root types. Domain modules attach fields via
// builder.queryField / builder.mutationField.
builder.queryType({});
builder.mutationType({});
