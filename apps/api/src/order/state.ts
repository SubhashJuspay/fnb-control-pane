import type { TicketItemStatus, TicketStatus } from '@repo/validation/ticket';

const ITEM_TRANSITIONS: Record<TicketItemStatus, TicketItemStatus[]> = {
  NEW:    ['FIRED', 'VOIDED'],
  FIRED:  ['READY', 'VOIDED'],
  READY:  ['SERVED', 'VOIDED'],
  SERVED: [],
  VOIDED: [],
};

const TICKET_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  OPEN:   ['CLOSED', 'VOIDED'],
  CLOSED: ['OPEN'],
  VOIDED: [],
};

export function canTransitionTicketItem(from: TicketItemStatus, to: TicketItemStatus): boolean {
  return ITEM_TRANSITIONS[from].includes(to);
}

export function canTransitionTicket(from: TicketStatus, to: TicketStatus): boolean {
  return TICKET_TRANSITIONS[from].includes(to);
}

export function canCloseTicket(items: Array<{ status: TicketItemStatus }>): boolean {
  return items.every((i) => i.status === 'SERVED' || i.status === 'VOIDED');
}
