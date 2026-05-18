import { z } from 'zod';

/**
 * Wire-format messages exchanged with the Android POS terminal.
 *
 * Inbound (terminal → server):
 *   - payment_result: card-read outcome for a specific intent
 *   - ping:           heartbeat
 *
 * Outbound (server → terminal):
 *   - ready:           handshake ack after the terminal connects
 *   - payment_request: customer kiosk asked for a card-read on this terminal
 *   - payment_cancel:  in-flight intent was voided server-side (auto-expire,
 *                      explicit cancel from kiosk, etc.)
 *   - pong:            heartbeat ack
 */

export const inboundMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('payment_result'),
    intentId: z.string().uuid(),
    status: z.enum(['APPROVED', 'DECLINED', 'CANCELLED']),
  }),
  z.object({ type: z.literal('ping') }),
]);
export type InboundMessage = z.infer<typeof inboundMessageSchema>;

export interface PaymentRequestPayload {
  intentId: string;
  amountCents: number;
  currency: string;
  shortNumber: number;
  customerName: string;
  tableLabel: string | null;
  items: Array<{
    name: string;
    qty: number;
    lineTotalCents: number;
    modifiers: string[];
  }>;
}

export type OutboundMessage =
  | { type: 'ready'; locationName: string; tenantName: string }
  | { type: 'pong' }
  | ({ type: 'payment_request' } & PaymentRequestPayload)
  | { type: 'payment_cancel'; intentId: string; reason: string };

export function encode(msg: OutboundMessage): string {
  return JSON.stringify(msg);
}
