import { createHmac } from "node:crypto";
import {
  DEFAULT_AVATAR,
  DEFAULT_ROOM_SETTINGS,
} from "@gtd/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApplication, type GameApplication } from "../src/app.js";
import type { ServerConfig } from "../src/config.js";
import { RedisGamePersistence } from "../src/persistence.js";

const redisUrl = process.env.TEST_REDIS_URL;
const sessionSecret = "redis-integration-secret-that-is-long-enough";

const redisConfig: ServerConfig = {
  nodeEnv: "production",
  host: "127.0.0.1",
  port: 0,
  redisUrl: redisUrl ?? "redis://127.0.0.1:6379/15",
  redisRequired: true,
  webOrigins: ["http://localhost:3000"],
  sessionSecret,
  webDistDirectory: "/definitely/not/a/web/build",
  logLevel: "silent",
  emptyRoomTtlMs: 30 * 60 * 1_000,
  roomLifetimeMs: 8 * 60 * 60 * 1_000,
  disconnectedSeatMs: 30_000,
  drawerPauseMs: 20_000,
};

describe.skipIf(!redisUrl)("live Redis lifecycle", () => {
  let firstRuntime: GameApplication | null = null;
  let secondRuntime: GameApplication | null = null;
  let roomCode: string | null = null;
  let reconnectTokenHash: string | null = null;

  beforeAll(() => {
    if (!redisUrl) {
      throw new Error("TEST_REDIS_URL must point to a dedicated Redis test database.");
    }
  });

  afterAll(async () => {
    await firstRuntime?.close();
    await secondRuntime?.close();

    if (redisUrl && (roomCode || reconnectTokenHash)) {
      const cleanup = new RedisGamePersistence(redisUrl);
      await cleanup.connect();
      if (roomCode) {
        await cleanup.deleteRoom(roomCode);
      }
      if (reconnectTokenHash) {
        await cleanup.deleteSession(reconnectTokenHash);
      }
      await cleanup.close();
    }
  });

  it("reports ready, persists a room, and rehydrates its reconnect seat after restart", async () => {
    const firstPersistence = new RedisGamePersistence(redisConfig.redisUrl);
    await firstPersistence.connect();
    firstRuntime = await buildApplication({
      config: redisConfig,
      persistence: firstPersistence,
    });

    const firstReady = await firstRuntime.app.inject({
      method: "GET",
      url: "/readyz",
    });
    expect(firstReady.statusCode).toBe(200);
    expect(firstReady.json()).toEqual({ status: "ok", persistence: "redis" });

    const firstHealth = await firstRuntime.app.inject({
      method: "GET",
      url: "/healthz",
    });
    expect(firstHealth.statusCode).toBe(200);
    expect(firstHealth.json()).toMatchObject({ status: "ok", redis: "up" });

    const session = await firstRuntime.engine.connect("redis-live-host");
    const created = await firstRuntime.engine.createRoom("redis-live-host", {
      idempotencyId: "redis-live-create-0001",
      name: "Redis Host",
      avatar: DEFAULT_AVATAR,
      settings: DEFAULT_ROOM_SETTINGS,
    });
    roomCode = created.data.snapshot.code;
    reconnectTokenHash = createHmac("sha256", sessionSecret)
      .update(session.reconnectToken)
      .digest("base64url");

    await firstRuntime.close();
    firstRuntime = null;

    const secondPersistence = new RedisGamePersistence(redisConfig.redisUrl);
    await secondPersistence.connect();
    secondRuntime = await buildApplication({
      config: redisConfig,
      persistence: secondPersistence,
    });

    const recovered = await secondRuntime.engine.connect(
      "redis-live-recovered-host",
      session.reconnectToken,
    );
    expect(recovered.recovered).toBe(true);
    expect(recovered.roomCode).toBe(roomCode);
    expect(recovered.playerId).toBe(created.data.credentials.playerId);
    expect(recovered.snapshot?.code).toBe(roomCode);

    const secondReady = await secondRuntime.app.inject({
      method: "GET",
      url: "/readyz",
    });
    expect(secondReady.statusCode).toBe(200);
  });
});
