import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildApplication } from "../src/app.js";
import type { ServerConfig } from "../src/config.js";
import { MemoryGamePersistence } from "../src/persistence.js";

const testConfig: ServerConfig = {
  nodeEnv: "test",
  host: "127.0.0.1",
  port: 3_000,
  redisUrl: "redis://127.0.0.1:6379",
  redisRequired: false,
  webOrigins: ["http://localhost:5173"],
  sessionSecret: "test-session-secret-that-is-long-enough",
  webDistDirectory: "/definitely/not/a/web/build",
  logLevel: "silent",
  emptyRoomTtlMs: 30 * 60 * 1_000,
  roomLifetimeMs: 8 * 60 * 60 * 1_000,
  disconnectedSeatMs: 30_000,
  drawerPauseMs: 20_000,
};

describe("HTTP application", () => {
  it("exposes liveness, readiness, safe theme metadata, and security headers", async () => {
    const persistence = new MemoryGamePersistence();
    await persistence.connect();
    const runtime = await buildApplication({
      config: testConfig,
      persistence,
    });

    const health = await runtime.app.inject({ method: "GET", url: "/healthz" });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toMatchObject({
      status: "degraded",
      redis: "down",
    });
    expect(health.headers["content-security-policy"]).toContain("default-src 'self'");
    expect(health.headers["content-security-policy"]).not.toContain(
      "upgrade-insecure-requests",
    );
    expect(health.headers["x-content-type-options"]).toBe("nosniff");

    const ready = await runtime.app.inject({ method: "GET", url: "/readyz" });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toEqual({ status: "ok", persistence: "memory" });

    const themes = await runtime.app.inject({ method: "GET", url: "/api/themes" });
    expect(themes.statusCode).toBe(200);
    expect(themes.json().themes.length).toBeGreaterThanOrEqual(6);
    expect(JSON.stringify(themes.json())).not.toContain('"words"');

    const missing = await runtime.app.inject({ method: "GET", url: "/api/missing" });
    expect(missing.statusCode).toBe(404);

    await runtime.close();
  });

  it("rejects browser origins outside the configured allowlist", async () => {
    const persistence = new MemoryGamePersistence();
    await persistence.connect();
    const runtime = await buildApplication({
      config: testConfig,
      persistence,
    });

    const response = await runtime.app.inject({
      method: "OPTIONS",
      url: "/api/themes",
      headers: {
        origin: "https://attacker.example",
        "access-control-request-method": "GET",
      },
    });
    expect(response.statusCode).toBe(500);
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();

    await runtime.close();
  });

  it("retains HTTPS upgrade protection for secure requests", async () => {
    const persistence = new MemoryGamePersistence();
    await persistence.connect();
    const runtime = await buildApplication({
      config: testConfig,
      persistence,
    });

    const response = await runtime.app.inject({
      method: "GET",
      url: "/healthz",
      headers: { "x-forwarded-proto": "https" },
    });
    expect(response.headers["content-security-policy"]).toContain(
      "upgrade-insecure-requests",
    );

    await runtime.close();
  });

  it("serves the production web build for root and client-side routes", async () => {
    const webDistDirectory = await mkdtemp(join(tmpdir(), "gtd-web-build-"));
    await writeFile(
      join(webDistDirectory, "index.html"),
      "<!doctype html><title>Guess That Drawing</title>",
      "utf8",
    );
    const persistence = new MemoryGamePersistence();
    await persistence.connect();
    const runtime = await buildApplication({
      config: { ...testConfig, webDistDirectory },
      persistence,
    });

    try {
      for (const url of ["/", "/join/ABCD"]) {
        const response = await runtime.app.inject({
          method: "GET",
          url,
          headers: { accept: "text/html" },
        });
        expect(response.statusCode).toBe(200);
        expect(response.body).toContain("Guess That Drawing");
        expect(response.headers["cache-control"]).toBe("no-store");
      }

      const missingApi = await runtime.app.inject({
        method: "GET",
        url: "/api/missing",
        headers: { accept: "text/html" },
      });
      expect(missingApi.statusCode).toBe(404);
      expect(missingApi.json()).toMatchObject({ error: "Not Found" });
    } finally {
      await runtime.close();
      await rm(webDistDirectory, { recursive: true, force: true });
    }
  });
});
