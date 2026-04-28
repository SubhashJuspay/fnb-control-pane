import { describe, expect, it } from 'vitest';
import { TokenBucket } from './rate-limit.js';

describe('TokenBucket', () => {
  it('allows up to capacity calls in a burst', () => {
    const bucket = new TokenBucket({ capacity: 3, refillPerSec: 1 });
    const now = 1000;
    expect(bucket.consume('ip-1', 1, now)).toBe(true);
    expect(bucket.consume('ip-1', 1, now)).toBe(true);
    expect(bucket.consume('ip-1', 1, now)).toBe(true);
    expect(bucket.consume('ip-1', 1, now)).toBe(false);
  });

  it('refills tokens over time', () => {
    const bucket = new TokenBucket({ capacity: 2, refillPerSec: 1 });
    const start = 0;
    expect(bucket.consume('k', 1, start)).toBe(true);
    expect(bucket.consume('k', 1, start)).toBe(true);
    expect(bucket.consume('k', 1, start)).toBe(false);
    // 1 second later -> 1 token refilled
    expect(bucket.consume('k', 1, start + 1000)).toBe(true);
    expect(bucket.consume('k', 1, start + 1000)).toBe(false);
  });

  it('caps refill at capacity', () => {
    const bucket = new TokenBucket({ capacity: 2, refillPerSec: 1 });
    // 1 hour later — refill should still cap at capacity = 2
    const future = Date.now() + 3_600_000;
    expect(bucket.consume('k', 1, future)).toBe(true);
    expect(bucket.consume('k', 1, future)).toBe(true);
    expect(bucket.consume('k', 1, future)).toBe(false);
  });

  it('keeps independent buckets per key', () => {
    const bucket = new TokenBucket({ capacity: 1, refillPerSec: 0 });
    const t = 1000;
    expect(bucket.consume('a', 1, t)).toBe(true);
    expect(bucket.consume('a', 1, t)).toBe(false);
    expect(bucket.consume('b', 1, t)).toBe(true);
    expect(bucket.consume('b', 1, t)).toBe(false);
  });

  it('supports n>1 consumes', () => {
    const bucket = new TokenBucket({ capacity: 5, refillPerSec: 0 });
    const t = 0;
    expect(bucket.consume('k', 3, t)).toBe(true);
    expect(bucket.consume('k', 3, t)).toBe(false);
    expect(bucket.consume('k', 2, t)).toBe(true);
    expect(bucket.consume('k', 1, t)).toBe(false);
  });
});
