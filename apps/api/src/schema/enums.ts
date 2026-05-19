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

export const TableShapeEnum = builder.enumType('TableShape', {
  values: ['RECT', 'CIRCLE'] as const,
});

export const TableManualStateEnum = builder.enumType('TableManualState', {
  values: ['NONE', 'CLEANING'] as const,
});

export const TableStateEnum = builder.enumType('TableState', {
  values: ['AVAILABLE', 'OCCUPIED', 'RESERVED', 'CLEANING'] as const,
});

export const ReservationKindEnum = builder.enumType('ReservationKind', {
  values: ['RESERVATION', 'WALKIN'] as const,
});

export const ReservationStatusEnum = builder.enumType('ReservationStatus', {
  values: [
    'PENDING',
    'CONFIRMED',
    'WAITING',
    'SEATED',
    'COMPLETED',
    'NO_SHOW',
    'CANCELLED',
  ] as const,
});

export const EmploymentTypeEnum = builder.enumType('EmploymentType', {
  values: ['FULL_TIME', 'PART_TIME', 'CONTRACTOR'] as const,
});

export const ShiftStatusEnum = builder.enumType('ShiftStatus', {
  values: ['DRAFT', 'PUBLISHED', 'CANCELLED'] as const,
});

export const DayOfWeekEnum = builder.enumType('DayOfWeek', {
  values: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const,
});

export const OnlinePickupKindEnum = builder.enumType('OnlinePickupKind', {
  values: ['ASAP', 'SCHEDULED'] as const,
});

export const OnlineOrderConfirmStatusEnum = builder.enumType(
  'OnlineOrderConfirmStatus',
  {
    values: ['PENDING', 'CONFIRMED', 'REJECTED'] as const,
  },
);

export const OnlineOrderPaymentModeEnum = builder.enumType('OnlineOrderPaymentMode', {
  values: ['PAY_AT_PICKUP', 'PAY_AT_KIOSK'] as const,
});

export const OnlineOrderPaymentStatusEnum = builder.enumType(
  'OnlineOrderPaymentStatus',
  {
    values: ['PENDING', 'CAPTURED', 'DECLINED'] as const,
  },
);

export const OrderOriginChannelEnum = builder.enumType('OrderOriginChannel', {
  values: ['IN_PERSON', 'ONLINE'] as const,
});

export const CashMovementKindEnum = builder.enumType('CashMovementKind', {
  values: ['PAY_IN', 'PAY_OUT', 'DEPOSIT', 'SALE_CASH', 'REFUND_CASH'] as const,
});

export const TenderMethodEnum = builder.enumType('TenderMethod', {
  values: ['CASH', 'CARD', 'MOBILE', 'GIFT'] as const,
});

export const TenderStatusEnum = builder.enumType('TenderStatus', {
  values: ['PENDING', 'AUTHORIZED', 'CAPTURED', 'DECLINED', 'VOIDED', 'REFUNDED'] as const,
});

export const StockMovementKindEnum = builder.enumType('StockMovementKind', {
  values: [
    'RESTOCK',
    'SALE_DEDUCT',
    'WASTE',
    'COUNT_ADJUST',
    'TRANSFER_IN',
    'TRANSFER_OUT',
  ] as const,
});
