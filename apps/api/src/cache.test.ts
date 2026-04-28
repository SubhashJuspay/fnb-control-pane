import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withTtlCache, invalidateCachePrefix, clearCache } from './cache.js';

beforeEach(() => {
  clearCache();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-04-28T00:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
  clearCache();
});

describe('withTtlCache', () => {
  it('invokes fn on miss and returns its value', async () => {
    const fn = vi.fn(async () => 'a');
    const v = await withTtlCache('k', 60_000, fn);
    expect(v).toBe('a');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('returns cached value on hit without invoking fn', async () => {
    const fn = vi.fn(async () => 'a');
    await withTtlCache('k', 60_000, fn);
    const v2 = await withTtlCache('k', 60_000, fn);
    expect(v2).toBe('a');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('re-invokes fn after ttl expires', async () => {
    let n = 0;
    const fn = vi.fn(async () => ++n);
    expect(await withTtlCache('k', 60_000, fn)).toBe(1);
    vi.advanceTimersByTime(59_999);
    expect(await withTtlCache('k', 60_000, fn)).toBe(1);
    vi.advanceTimersByTime(2);
    expect(await withTtlCache('k', 60_000, fn)).toBe(2);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('different keys are independent', async () => {
    const v1 = await withTtlCache('a', 60_000, async () => 1);
    const v2 = await withTtlCache('b', 60_000, async () => 2);
    expect(v1).toBe(1);
    expect(v2).toBe(2);
  });

  it('parallel calls with the same key dedupe to a single fn invocation', async () => {
    let calls = 0;
    const fn = async () => {
      calls += 1;
      // Force suspension so the second caller arrives before resolution.
      await Promise.resolve();
      await Promise.resolve();
      return 'x';
    };
    const [a, b, c] = await Promise.all([
      withTtlCache('shared', 60_000, fn),
      withTtlCache('shared', 60_000, fn),
      withTtlCache('shared', 60_000, fn),
    ]);
    expect([a, b, c]).toEqual(['x', 'x', 'x']);
    expect(calls).toBe(1);
  });

  it('does not cache a rejected promise (next call re-runs fn)', async () => {
    let attempt = 0;
    const fn = async () => {
      attempt += 1;
      if (attempt === 1) throw new Error('boom');
      return 'ok';
    };
    await expect(withTtlCache('k', 60_000, fn)).rejects.toThrow('boom');
    await expect(withTtlCache('k', 60_000, fn)).resolves.toBe('ok');
    expect(attempt).toBe(2);
  });
});

describe('invalidateCachePrefix', () => {
  it('removes only entries whose key starts with the prefix', async () => {
    let xCalls = 0;
    let yCalls = 0;
    await withTtlCache('analytics:loc-1:topItems', 60_000, async () => ++xCalls);
    await withTtlCache('analytics:loc-2:topItems', 60_000, async () => ++yCalls);
    invalidateCachePrefix('analytics:loc-1');
    await withTtlCache('analytics:loc-1:topItems', 60_000, async () => ++xCalls);
    await withTtlCache('analytics:loc-2:topItems', 60_000, async () => ++yCalls);
    expect(xCalls).toBe(2);
    expect(yCalls).toBe(1);
  });
});

describe('clearCache', () => {
  it('drops all entries', async () => {
    let calls = 0;
    await withTtlCache('a', 60_000, async () => ++calls);
    await withTtlCache('b', 60_000, async () => ++calls);
    clearCache();
    await withTtlCache('a', 60_000, async () => ++calls);
    expect(calls).toBe(3);
  });
});
