import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  it("normalizes origins and durations", () => {
    const config = loadConfig(
      {
        NODE_ENV: "test",
        PORT: "4321",
        WEB_ORIGIN: "https://one.example, https://two.example",
        SESSION_SECRET: "a-test-secret-that-is-at-least-32-characters",
        EMPTY_ROOM_TTL_SECONDS: "120",
        ROOM_LIFETIME_SECONDS: "3600",
      },
      "/workspace",
    );

    expect(config.port).toBe(4321);
    expect(config.webOrigins).toEqual(["https://one.example", "https://two.example"]);
    expect(config.emptyRoomTtlMs).toBe(120_000);
    expect(config.roomLifetimeMs).toBe(3_600_000);
    expect(config.webDistDirectory).toBe("/web/dist");
  });

  it.each([
    "development-only-secret-change-me",
    "replace-with-at-least-32-random-characters",
  ])("rejects the known placeholder session secret %s in production", (secret) => {
    expect(() =>
      loadConfig({
        NODE_ENV: "production",
        SESSION_SECRET: secret,
      }),
    ).toThrow(/SESSION_SECRET/);
  });
});
