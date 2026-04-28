import { z } from 'zod';

export const orderTypeSchema = z.enum(['DINE_IN', 'TAKEOUT']);
export type OrderType = z.infer<typeof orderTypeSchema>;

export const ticketStatusSchema = z.enum(['OPEN', 'CLOSED', 'VOIDED']);
export type TicketStatus = z.infer<typeof ticketStatusSchema>;

export const ticketItemStatusSchema = z.enum(['NEW', 'FIRED', 'READY', 'SERVED', 'VOIDED']);
export type TicketItemStatus = z.infer<typeof ticketItemStatusSchema>;

export const openTicketSchema = z.object({
  customerLabel: z.string().trim().max(120).optional().nullable(),
  orderType: orderTypeSchema.default('DINE_IN'),
});
export type OpenTicketInput = z.infer<typeof openTicketSchema>;

export const updateTicketLabelSchema = z.object({
  ticketId: z.string().uuid(),
  customerLabel: z.string().trim().max(120).nullable(),
});
export type UpdateTicketLabelInput = z.infer<typeof updateTicketLabelSchema>;

export const updateTicketOrderTypeSchema = z.object({
  ticketId: z.string().uuid(),
  orderType: orderTypeSchema,
});
export type UpdateTicketOrderTypeInput = z.infer<typeof updateTicketOrderTypeSchema>;

export const closeTicketSchema = z.object({
  ticketId: z.string().uuid(),
  closeNote: z.string().trim().max(500).optional().nullable(),
});
export type CloseTicketInput = z.infer<typeof closeTicketSchema>;

export const reopenTicketSchema = z.object({ ticketId: z.string().uuid() });
export type ReopenTicketInput = z.infer<typeof reopenTicketSchema>;

export const voidTicketSchema = z.object({
  ticketId: z.string().uuid(),
  voidReason: z.string().trim().min(2).max(500),
});
export type VoidTicketInput = z.infer<typeof voidTicketSchema>;

const addTicketItemModifierSchema = z.object({ modifierId: z.string().uuid() });

export const addTicketItemSchema = z.object({
  ticketId: z.string().uuid(),
  menuItemId: z.string().uuid(),
  quantity: z.number().int().min(1).max(99).default(1),
  modifiers: z.array(addTicketItemModifierSchema).default([]),
  notes: z.string().trim().max(500).optional().nullable(),
});
export type AddTicketItemInput = z.infer<typeof addTicketItemSchema>;

export const updateTicketItemSchema = z.object({
  ticketItemId: z.string().uuid(),
  quantity: z.number().int().min(1).max(99).optional(),
  notes: z.string().trim().max(500).optional().nullable(),
});
export type UpdateTicketItemInput = z.infer<typeof updateTicketItemSchema>;

export const voidTicketItemSchema = z.object({
  ticketItemId: z.string().uuid(),
  voidReason: z.string().trim().min(2).max(500),
});
export type VoidTicketItemInput = z.infer<typeof voidTicketItemSchema>;

export const setTicketItemModifiersSchema = z.object({
  ticketItemId: z.string().uuid(),
  modifierIds: z.array(z.string().uuid()),
});
export type SetTicketItemModifiersInput = z.infer<typeof setTicketItemModifiersSchema>;

export const fireTicketSchema = z.object({ ticketId: z.string().uuid() });
export type FireTicketInput = z.infer<typeof fireTicketSchema>;

export const fireTicketItemSchema = z.object({ ticketItemId: z.string().uuid() });
export type FireTicketItemInput = z.infer<typeof fireTicketItemSchema>;

export const markTicketItemReadySchema = z.object({ ticketItemId: z.string().uuid() });
export type MarkTicketItemReadyInput = z.infer<typeof markTicketItemReadySchema>;

export const markTicketItemServedSchema = z.object({ ticketItemId: z.string().uuid() });
export type MarkTicketItemServedInput = z.infer<typeof markTicketItemServedSchema>;
