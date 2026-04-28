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

export const ItemCourseEnum = builder.enumType('ItemCourse', {
  values: ['APPETIZER', 'MAIN', 'DESSERT', 'SIDE', 'BEVERAGE', 'OTHER'] as const,
});

export const TaxCategoryKindEnum = builder.enumType('TaxCategoryKind', {
  values: ['FOOD', 'NON_ALCOHOL_BEV', 'ALCOHOL', 'RETAIL', 'OTHER'] as const,
});

export const TicketStatusEnum = builder.enumType('TicketStatus', {
  values: ['OPEN', 'CLOSED', 'VOIDED'] as const,
});

export const TicketItemStatusEnum = builder.enumType('TicketItemStatus', {
  values: ['NEW', 'FIRED', 'READY', 'SERVED', 'VOIDED'] as const,
});

export const OrderTypeEnum = builder.enumType('OrderType', {
  values: ['DINE_IN', 'TAKEOUT'] as const,
});

export const DiscountKindEnum = builder.enumType('DiscountKind', {
  values: ['FLAT', 'PERCENT'] as const,
});
