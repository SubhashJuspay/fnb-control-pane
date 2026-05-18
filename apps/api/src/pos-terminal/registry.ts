import type { WebSocket } from 'ws';
import { logger } from '../logger.js';

/**
 * In-memory map of live POS-terminal connections keyed by tenant/location.
 *
 * Single-instance only — fine for the current Render setup. When we scale
 * out we'll need a Redis-backed registry that tracks which API node owns
 * which connection, and forwards `payment_request` messages across nodes.
 */
const liveTerminals = new Map<string, WebSocket>();

export function registryKey(tenantSlug: string, locationSlug: string): string {
  return `${tenantSlug}::${locationSlug}`;
}

/**
 * Register a new terminal connection for a location. If a previous WS is
 * already registered under the same key, close it gracefully so this new
 * one wins — handles the "app reconnected after a network hiccup" case
 * without leaving zombie connections in the map.
 */
export function registerTerminal(
  key: string,
  ws: WebSocket,
): void {
  const previous = liveTerminals.get(key);
  if (previous) {
    try {
      previous.close(1001, 'replaced by newer connection');
    } catch {
      // ignore — best-effort cleanup
    }
  }
  liveTerminals.set(key, ws);
  logger.info({ key }, 'pos-terminal: registered');
}

export function unregisterTerminal(key: string, ws: WebSocket): void {
  // Only unregister if the WS we hold is actually this one — guards against
  // a stale `close` firing after a newer connection has already replaced us.
  const current = liveTerminals.get(key);
  if (current === ws) {
    liveTerminals.delete(key);
    logger.info({ key }, 'pos-terminal: unregistered');
  }
}

export function getTerminal(key: string): WebSocket | null {
  return liveTerminals.get(key) ?? null;
}

export function isTerminalOnline(key: string): boolean {
  const ws = liveTerminals.get(key);
  if (!ws) return false;
  // OPEN === 1 in the ws library
  return ws.readyState === 1;
}

/** Test/debug only — count live connections. */
export function liveTerminalCount(): number {
  return liveTerminals.size;
}

/** Test-only — wipe the map. Production code must never call this. */
export function _resetTerminalsForTesting(): void {
  for (const ws of liveTerminals.values()) {
    try {
      ws.close(1000, 'test reset');
    } catch {
      // ignore
    }
  }
  liveTerminals.clear();
}
