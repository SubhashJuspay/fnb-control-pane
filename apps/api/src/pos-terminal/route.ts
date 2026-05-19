import type { FastifyInstance } from 'fastify';
import websocketPlugin from '@fastify/websocket';
import { logger } from '../logger.js';
import { prisma } from '../prisma.js';
import { applyPaymentResult } from './dispatcher.js';
import { inboundMessageSchema, encode } from './protocol.js';
import { registerTerminal, registryKey, unregisterTerminal } from './registry.js';

const HEARTBEAT_MS = 25_000;

/**
 * Wire the POS-terminal WebSocket endpoint into the Fastify server.
 *
 * Endpoint: GET /pos-terminal?tenantSlug=…&locationSlug=…
 *
 * - No auth in this demo build. Anyone who knows the slugs can connect.
 *   To harden: issue a device token via admin UI, hash it, and validate
 *   it inside this handler before calling registerTerminal.
 * - Last-write-wins on `(tenantSlug, locationSlug)` — a new connection
 *   from the same terminal app evicts the previous one. Handles
 *   reconnect-after-network-blip cleanly.
 */
export async function registerPosTerminalRoute(app: FastifyInstance): Promise<void> {
  await app.register(websocketPlugin);

  app.get('/pos-terminal', { websocket: true }, async (socket, req) => {
    const tenantSlug = readQueryParam(req.query, 'tenantSlug');
    const locationSlug = readQueryParam(req.query, 'locationSlug');
    if (!tenantSlug || !locationSlug) {
      socket.close(4400, 'tenantSlug + locationSlug query params required');
      return;
    }

    // Validate the slugs against the DB. Anyone can spam wss:// with random
    // strings; reject unknown ones before letting them sit in the registry.
    const location = await prisma.location.findFirst({
      where: {
        slug: locationSlug,
        status: 'ACTIVE',
        tenant: { slug: tenantSlug, status: 'ACTIVE' },
      },
      select: {
        id: true,
        name: true,
        tenant: { select: { name: true } },
      },
    });
    if (!location) {
      socket.close(4404, 'tenant or location not found');
      return;
    }

    const key = registryKey(tenantSlug, locationSlug);
    registerTerminal(key, socket);
    socket.send(
      encode({
        type: 'ready',
        locationName: location.name,
        tenantName: location.tenant.name,
      }),
    );

    // Keepalive: send a pong-shaped frame periodically. If the connection
    // is dead the server `ws` layer detects it on the next send and fires
    // the `close` handler below. Apps should reply to pings, but we don't
    // strictly enforce — the close event itself is sufficient.
    const heartbeat = setInterval(() => {
      if (socket.readyState !== 1) return;
      try {
        socket.send(encode({ type: 'pong' }));
      } catch {
        // ignore — `close` will fire shortly
      }
    }, HEARTBEAT_MS);
    heartbeat.unref?.();

    socket.on('message', (raw) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw.toString());
      } catch {
        logger.warn({ key }, 'pos-terminal: dropped non-JSON frame');
        return;
      }
      const result = inboundMessageSchema.safeParse(parsed);
      if (!result.success) {
        logger.warn({ key, issues: result.error.issues }, 'pos-terminal: bad message');
        return;
      }
      const msg = result.data;
      if (msg.type === 'ping') {
        try {
          socket.send(encode({ type: 'pong' }));
        } catch {
          // ignore
        }
        return;
      }
      // payment_result — log the connection identity so a stranded
      // dev WS that fires a stale result is easy to spot in logs.
      logger.info(
        { key, intentId: msg.intentId, status: msg.status },
        'pos-terminal: received payment_result',
      );
      void applyPaymentResult({
        prisma,
        intentId: msg.intentId,
        status: msg.status,
        fromLocationId: location.id,
      }).catch((err) => {
        logger.error({ err, intentId: msg.intentId }, 'pos-terminal: result apply failed');
      });
    });

    socket.on('close', () => {
      clearInterval(heartbeat);
      unregisterTerminal(key, socket);
    });

    socket.on('error', (err) => {
      logger.error({ err, key }, 'pos-terminal: socket error');
    });
  });
}

function readQueryParam(query: unknown, name: string): string | null {
  if (!query || typeof query !== 'object') return null;
  const v = (query as Record<string, unknown>)[name];
  if (typeof v === 'string' && v.length > 0) return v;
  if (Array.isArray(v) && typeof v[0] === 'string' && v[0].length > 0) return v[0];
  return null;
}
