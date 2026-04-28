import { afterAll, describe, expect, it } from 'vitest';
import { setupTestDb } from './test/testcontainers.js';

describe('pgPubSub end-to-end', async () => {
  // Note: pubsub talks to env.DATABASE_URL directly (not via Prisma).
  // We boot Postgres via Testcontainers and override DATABASE_URL for the test.
  const { cleanup, container } = await setupTestDb();
  const url = container.getConnectionUri();

  afterAll(async () => {
    await cleanup();
  });

  it('listener receives payloads published on the channel', async () => {
    process.env.DATABASE_URL = url;
    const { pubsub, ticketChannelName } = await import('./pubsub.js');
    const channel = ticketChannelName('loc-1');
    const received: unknown[] = [];
    const unsubscribe = await pubsub.subscribe(channel, (payload) => {
      received.push(payload);
    });
    await pubsub.publish(channel, { kind: 'TicketChanged', ticketId: 't1' });
    // Give Postgres a tick to fan out
    await new Promise((r) => setTimeout(r, 50));
    expect(received).toEqual([{ kind: 'TicketChanged', ticketId: 't1' }]);
    unsubscribe();
    await pubsub.close();
  }, 30_000);
});
