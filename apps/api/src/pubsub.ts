import { Client } from 'pg';
import { logger } from './logger.js';
import { env } from './env.js';

type Listener<T> = (payload: T) => void;

interface ChannelEntry {
  listeners: Set<Listener<unknown>>;
}

class PgPubSub {
  private client: Client | null = null;
  private channels = new Map<string, ChannelEntry>();
  private connecting: Promise<Client> | null = null;
  private notifyClient: Client | null = null;

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
      c.on('error', (err) => logger.error({ err }, 'pubsub listen client error'));
      this.client = c;
      return c;
    })();
    return this.connecting;
  }

  private async getNotifyClient(): Promise<Client> {
    if (this.notifyClient) return this.notifyClient;
    const c = new Client({ connectionString: env.DATABASE_URL });
    await c.connect();
    c.on('error', (err) => logger.error({ err }, 'pubsub notify client error'));
    this.notifyClient = c;
    return c;
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

  async publish<T>(channel: string, payload: T): Promise<void> {
    const c = await this.getNotifyClient();
    const safe = channel.replace(/"/g, '""');
    await c.query(`SELECT pg_notify($1, $2)`, [safe, JSON.stringify(payload)]);
  }

  async close(): Promise<void> {
    await this.client?.end().catch(() => undefined);
    await this.notifyClient?.end().catch(() => undefined);
    this.client = null;
    this.notifyClient = null;
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
