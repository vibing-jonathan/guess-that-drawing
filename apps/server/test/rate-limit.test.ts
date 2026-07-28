import { describe, expect, it } from "vitest";
import { EventRateLimiter } from "../src/rate-limit.js";

describe("EventRateLimiter", () => {
  it("enforces and resets a per-key fixed window", () => {
    let now = 100;
    const limiter = new EventRateLimiter(() => now);
    const rule = { limit: 2, intervalMs: 1_000 };

    expect(limiter.consume("socket:chat", rule).allowed).toBe(true);
    expect(limiter.consume("socket:chat", rule).allowed).toBe(true);
    expect(limiter.consume("socket:chat", rule)).toEqual({
      allowed: false,
      retryAfterMs: 1_000,
    });

    now += 1_000;
    expect(limiter.consume("socket:chat", rule).allowed).toBe(true);
  });
});
