interface Entry<T> {
  value: T;
  expiresAt: number;
}

const store = new Map<string, Entry<unknown>>();
const pending = new Map<string, Promise<unknown>>();

/**
 * Per-process TTL cache with inflight deduplication.
 *
 * - On hit (entry not expired): returns the cached value without invoking `fn`.
 * - On miss but with an inflight call for the same key: returns that promise.
 * - On miss with no inflight: invokes `fn`, caches the resolved value for
 *   `ttlMs`, and returns it. Rejections are NOT cached.
 */
export async function withTtlCache<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = store.get(key) as Entry<T> | undefined;
  if (hit && hit.expiresAt > now) return hit.value;

  const inflight = pending.get(key) as Promise<T> | undefined;
  if (inflight) return inflight;

  const promise = (async () => {
    try {
      const value = await fn();
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    } finally {
      pending.delete(key);
    }
  })();

  pending.set(key, promise);
  return promise;
}

export function invalidateCachePrefix(prefix: string): void {
  for (const k of store.keys()) {
    if (k.startsWith(prefix)) store.delete(k);
  }
}

export function clearCache(): void {
  store.clear();
  pending.clear();
}
