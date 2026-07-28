export interface RateLimit {
  limit: number;
  intervalMs: number;
}

interface Bucket {
  resetAt: number;
  used: number;
}

/**
 * A deliberately small fixed-window limiter for per-socket game events.
 * Infrastructure-level IP limits should still sit in front of the container.
 */
export class EventRateLimiter {
  readonly #buckets = new Map<string, Bucket>();
  readonly #now: () => number;

  constructor(now: () => number = Date.now) {
    this.#now = now;
  }

  consume(key: string, rule: RateLimit): { allowed: boolean; retryAfterMs: number } {
    const now = this.#now();
    const current = this.#buckets.get(key);

    if (!current || current.resetAt <= now) {
      this.#buckets.set(key, { resetAt: now + rule.intervalMs, used: 1 });
      return { allowed: true, retryAfterMs: 0 };
    }

    if (current.used >= rule.limit) {
      return { allowed: false, retryAfterMs: Math.max(1, current.resetAt - now) };
    }

    current.used += 1;
    return { allowed: true, retryAfterMs: 0 };
  }

  clearPrefix(prefix: string): void {
    for (const key of this.#buckets.keys()) {
      if (key.startsWith(prefix)) {
        this.#buckets.delete(key);
      }
    }
  }

  sweep(): void {
    const now = this.#now();
    for (const [key, bucket] of this.#buckets) {
      if (bucket.resetAt <= now) {
        this.#buckets.delete(key);
      }
    }
  }
}
