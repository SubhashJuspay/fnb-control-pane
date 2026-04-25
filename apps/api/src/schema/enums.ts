import { builder } from './builder.js';

export const TenantStatusEnum = builder.enumType('TenantStatus', {
  values: ['ACTIVE', 'SUSPENDED', 'DELETED'] as const,
});

export const LocationStatusEnum = builder.enumType('LocationStatus', {
  values: ['ACTIVE', 'CLOSED', 'ARCHIVED'] as const,
});

export const RoleEnum = builder.enumType('Role', {
  values: ['OWNER', 'ADMIN', 'MANAGER', 'STAFF', 'VIEWER'] as const,
});

export const MembershipStatusEnum = builder.enumType('MembershipStatus', {
  values: ['ACTIVE', 'REVOKED'] as const,
});

export const UserStatusEnum = builder.enumType('UserStatus', {
  values: ['ACTIVE', 'DISABLED'] as const,
});
