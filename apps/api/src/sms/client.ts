import { env } from '../env.js';
import { logger } from '../logger.js';

/**
 * Minimal Twilio sender via the REST API. We avoid adding the `twilio`
 * dependency: a single fetch + Basic auth is enough for transactional SMS.
 *
 * Behaviour:
 * - If any of `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`
 *   is missing, every send becomes a no-op (returns false). This keeps SMS
 *   strictly opt-in: out of the box, no SMS is sent.
 * - Errors are caught and logged at warn level. Sending must never break
 *   the user-facing mutation that triggered it.
 *
 * Tests can override the implementation via `setSmsSender`.
 */

export interface SendSmsOptions {
  to: string;
  body: string;
}

export type SmsSender = (opts: SendSmsOptions) => Promise<boolean>;

let sender: SmsSender | null = null;

export function setSmsSender(s: SmsSender | null): void {
  sender = s;
}

function isConfigured(): boolean {
  return Boolean(
    env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM_NUMBER,
  );
}

async function defaultSend(opts: SendSmsOptions): Promise<boolean> {
  if (!isConfigured()) return false;
  const sid = env.TWILIO_ACCOUNT_SID as string;
  const token = env.TWILIO_AUTH_TOKEN as string;
  const from = env.TWILIO_FROM_NUMBER as string;
  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`;
  const auth = Buffer.from(`${sid}:${token}`).toString('base64');
  const body = new URLSearchParams({ From: from, To: opts.to, Body: opts.body });
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '<no body>');
    throw new Error(`Twilio HTTP ${res.status}: ${text}`);
  }
  return true;
}

/**
 * Send an SMS, swallowing any failure. Returns whether a send was attempted
 * AND succeeded. Returns false if Twilio isn't configured.
 */
export async function sendSmsSafely(
  opts: SendSmsOptions,
  context: { kind: string },
): Promise<boolean> {
  const fn = sender ?? defaultSend;
  try {
    const ok = await fn(opts);
    if (ok) {
      logger.info({ kind: context.kind, to: opts.to }, 'sms sent');
    }
    return ok;
  } catch (err) {
    logger.warn({ kind: context.kind, to: opts.to, err }, 'sms failed');
    return false;
  }
}
