/**
 * Concise transactional SMS for online orders. SMS bodies are short on
 * purpose — most carriers cap at ~160 chars per segment, longer messages
 * are billed multiple times.
 */

export interface OrderSmsContext {
  customerName: string;
  shortNumber: number;
  tenantName: string;
  trackingUrl: string;
  rejectReason?: string | null;
}

function firstName(full: string): string {
  const f = full.trim().split(/\s+/)[0] ?? full;
  return f.replace(/[^A-Za-z0-9-]/g, '') || full;
}

export function smsOrderReceived(c: OrderSmsContext): string {
  return `Hi ${firstName(c.customerName)} — ${c.tenantName} has your order #${c.shortNumber}. We'll text when it's ready. Track: ${c.trackingUrl}`;
}

export function smsOrderConfirmed(c: OrderSmsContext): string {
  return `${c.tenantName}: order #${c.shortNumber} confirmed and being prepared. We'll text when it's ready.`;
}

export function smsOrderReady(c: OrderSmsContext): string {
  return `${c.tenantName}: order #${c.shortNumber} is ready for pickup!`;
}

export function smsOrderRejected(c: OrderSmsContext): string {
  return c.rejectReason
    ? `${c.tenantName}: we couldn't accept order #${c.shortNumber}. Reason: ${c.rejectReason}`
    : `${c.tenantName}: we couldn't accept order #${c.shortNumber}. Please contact the location.`;
}
