interface BucketState {
  tokens: number;
  lastRefill: number;
}

export class TokenBucket {
  private capacity: number;
  private refillPerMs: number;
  private state = new Map<string, BucketState>();

  constructor(args: { capacity: number; refillPerSec: number }) {
    this.capacity = args.capacity;
    this.refillPerMs = args.refillPerSec / 1000;
  }

  consume(key: string, n = 1, now = Date.now()): boolean {
    const s = this.state.get(key) ?? { tokens: this.capacity, lastRefill: now };
    const elapsed = now - s.lastRefill;
    const refill = elapsed * this.refillPerMs;
    s.tokens = Math.min(this.capacity, s.tokens + refill);
    s.lastRefill = now;
    if (s.tokens < n) {
      this.state.set(key, s);
      return false;
    }
    s.tokens -= n;
    this.state.set(key, s);
    return true;
  }
}
