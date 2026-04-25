const MAILHOG_API = process.env.MAILHOG_API ?? 'http://localhost:8025/api/v2';

export interface MailHogAddress {
  Mailbox: string;
  Domain: string;
}

export interface MailHogMessage {
  ID: string;
  From: MailHogAddress;
  To: MailHogAddress[];
  Content: { Headers: Record<string, string[]>; Body: string };
}

interface MailHogListResponse {
  total: number;
  count: number;
  start: number;
  items: MailHogMessage[];
}

export async function clearMailHog(): Promise<void> {
  // MailHog v1 supports DELETE on /messages; v2 doesn't.
  await fetch(`${MAILHOG_API.replace('/v2', '/v1')}/messages`, {
    method: 'DELETE',
  });
}

export interface FindEmailOptions {
  timeoutMs?: number;
}

export async function findEmailTo(
  recipient: string,
  opts: FindEmailOptions = {},
): Promise<MailHogMessage | null> {
  const deadline = Date.now() + (opts.timeoutMs ?? 15_000);
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${MAILHOG_API}/messages`);
      if (res.ok) {
        const data = (await res.json()) as MailHogListResponse;
        const msg = data.items.find((m) =>
          m.To.some((t) => `${t.Mailbox}@${t.Domain}` === recipient),
        );
        if (msg) return msg;
      }
    } catch {
      // ignore transient connection errors and retry
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}

/**
 * Tolerant URL extractor for MailHog message bodies. MailHog can return
 * MIME-encoded bodies and quoted-printable artifacts; we strip soft line
 * breaks and decode `=XX` hex escapes before scanning.
 */
export function extractFirstUrl(body: string, prefix: string): string | null {
  const decoded = body
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-F]{2})/g, (_, hex: string) =>
      String.fromCharCode(parseInt(hex, 16)),
    );
  const idx = decoded.indexOf(prefix);
  if (idx < 0) return null;
  const slice = decoded.slice(idx);
  const match = slice.match(/^[^\s"<>'\]]+/);
  return match?.[0] ?? null;
}
