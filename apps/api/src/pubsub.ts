import { Client, Pool } from 'pg';
import { logger } from './logger.js';
import { env } from './env.js';

type Listener<T> = (payload: T) => void;

interface ChannelEntry {
  listeners: Set<Listener<unknown>>;
}

/**
 * Postgres LISTEN/NOTIFY pubsub.
 *
 * Listen side uses a dedicated long-lived `Client` (LISTEN only works on the
 * specific connection it was issued on — pools rotate connections so they
 * can't be used here). The listener is replaced on `error` so a dropped
 * connection (Neon closes idle connections aggressively) doesn't permanently
 * break SSE.
 *
 * Notify side uses a `Pool` — every publish is a one-shot `SELECT pg_notify`
 * that doesn't care which underlying connection serves it. The pool handles
 * reconnection on its own.
 *
 * `publish()` is intentionally non-throwing: a transient pubsub outage must
 * not bubble up and fail the calling mutation, because the row write has
 * already committed by the time we publish. Logging + telemetry instead.
 */
class PgPubSub {
  private client: Client | null = null;
  private channels = new Map<string, ChannelEntry>();
  private connecting: Promise<Client> | null = null;
  private notifyPool: Pool | null = null;

  private async getListenClient(): Promise<Client> {
    if (this.client) return this.client;
    if (this.connecting) return this.connecting;
    this.connecting = (async () => {
      const c = new Client({ connectionString: env.DATABASE_URL });
      await c.connect();
      c.on('notification', (msg) => {
        if (!msg.channel || !msg.payload) return;
        const entry = this.channels.get(msg.channel);
        if (!entry) return;
        try {
          const parsed = JSON.parse(msg.payload);
          for (const listener of entry.listeners) listener(parsed);
        } catch (e) {
          logger.warn({ err: e, payload: msg.payload }, 'pubsub: invalid JSON payload');
        }
      });
      c.on('error', (err) => {
        // Drop the dead client so the next subscribe re-connects. Any active
        // subscribers will see their iterators stall until the next publish
        // wakes them up; not ideal but better than crashing.
        logger.error({ err }, 'pubsub listen client error — discarding for reconnect');
        if (this.client === c) {
          this.client = null;
          this.connecting = null;
        }
        // Best-effort cleanup; ignore errors because the socket is already gone.
        c.end().catch(() => undefined);
      });
      this.client = c;
      this.connecting = null;
      return c;
    })();
    return this.connecting;
  }

  private getNotifyPool(): Pool {
    if (this.notifyPool) return this.notifyPool;
    this.notifyPool = new Pool({
      connectionString: env.DATABASE_URL,
      // Small pool — publishes are short-lived and infrequent relative to
      // request traffic. Keep idle connections short so Neon doesn't close
      // them out from under us.
      max: 3,
      idleTimeoutMillis: 10_000,
    });
    this.notifyPool.on('error', (err) =>
      logger.error({ err }, 'pubsub notify pool error'),
    );
    return this.notifyPool;
  }

  async subscribe<T>(channel: string, listener: Listener<T>): Promise<() => void> {
    const c = await this.getListenClient();
    let entry = this.channels.get(channel);
    if (!entry) {
      entry = { listeners: new Set() };
      this.channels.set(channel, entry);
      await c.query(`LISTEN "${channel.replace(/"/g, '""')}"`);
    }
    entry.listeners.add(listener as Listener<unknown>);
    return () => {
      entry!.listeners.delete(listener as Listener<unknown>);
      if (entry!.listeners.size === 0) {
        c.query(`UNLISTEN "${channel.replace(/"/g, '""')}"`).catch((err) => {
          logger.warn({ err, channel }, 'pubsub unlisten failed');
        });
        this.channels.delete(channel);
      }
    };
  }

  /**
   * Best-effort notify. Never throws — pubsub is auxiliary; the row write has
   * already happened by the time we publish. Real-time consumers (KDS, etc.)
   * will fall back to their next poll/refetch if a notification is missed.
   */
  async publish<T>(channel: string, payload: T): Promise<void> {
    const safe = channel.replace(/"/g, '""');
    try {
      const pool = this.getNotifyPool();
      await pool.query(`SELECT pg_notify($1, $2)`, [safe, JSON.stringify(payload)]);
    } catch (err) {
      logger.warn({ err, channel }, 'pubsub publish failed — continuing');
    }
  }

  async close(): Promise<void> {
    await this.client?.end().catch(() => undefined);
    await this.notifyPool?.end().catch(() => undefined);
    this.client = null;
    this.notifyPool = null;
    this.channels.clear();
  }
}

export const pubsub = new PgPubSub();

export function ticketChannelName(locationId: string): string {
  return `ticket_updates_${locationId}`;
}

export function floorChannelName(locationId: string): string {
  return `floor_updates_${locationId}`;
}

export function scheduleChannelName(locationId: string): string {
  return `schedule_updates_${locationId}`;
}

export function onlineOrdersChannelName(locationId: string): string {
  return `online_orders_${locationId}`;
}
