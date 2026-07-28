import { beforeEach, describe, expect, it } from "vitest";
import type { Redis } from "ioredis";
import {
  MemoryGamePersistence,
  RedisGamePersistence,
} from "../src/persistence.js";

describe("MemoryGamePersistence", () => {
  let now = 1_000;
  let persistence: MemoryGamePersistence;

  beforeEach(async () => {
    now = 1_000;
    persistence = new MemoryGamePersistence(() => now);
    await persistence.connect();
  });

  it("round-trips rooms without sharing mutable references", async () => {
    const state = { players: ["A"] };
    await persistence.saveRoom({
      code: "ABC123",
      createdAt: now,
      expiresAt: now + 1_000,
      isEmpty: false,
      value: state,
    });
    state.players.push("B");

    expect(await persistence.getRoom("ABC123")).toEqual({ players: ["A"] });
    expect(await persistence.listRoomCodes()).toEqual(["ABC123"]);
  });

  it("expires rooms and reconnect credentials", async () => {
    await persistence.saveRoom({
      code: "ABC123",
      createdAt: now,
      expiresAt: now + 50,
      isEmpty: true,
      value: { revision: 1 },
    });
    await persistence.saveSession({
      sessionId: "session",
      reconnectTokenHash: "hash",
      roomCode: "ABC123",
      playerId: "player",
      createdAt: now,
      expiresAt: now + 50,
    });

    now += 51;
    expect(await persistence.getRoom("ABC123")).toBeNull();
    expect(await persistence.getSession("hash")).toBeNull();
    expect(await persistence.listRoomCodes()).toEqual([]);
  });
});

describe("RedisGamePersistence connection lifecycle", () => {
  it("reconnects after the bounded Redis client enters its terminal state", async () => {
    const fakeRedis = {
      status: "end",
      connectCalls: 0,
      on() {
        return this;
      },
      async connect() {
        this.connectCalls += 1;
        this.status = "ready";
      },
      async ping() {
        if (this.status !== "ready") {
          throw new Error("Redis is unavailable.");
        }
        return "PONG";
      },
      async quit() {
        this.status = "end";
        return "OK";
      },
      disconnect() {
        this.status = "end";
      },
    };
    const persistence = new RedisGamePersistence(
      "redis://127.0.0.1:6379",
      fakeRedis as unknown as Redis,
    );

    await persistence.connect();
    expect(fakeRedis.connectCalls).toBe(1);

    fakeRedis.status = "end";
    await expect(persistence.isReady()).resolves.toBe(true);
    expect(fakeRedis.connectCalls).toBe(2);

    await persistence.close();
    await expect(persistence.isReady()).resolves.toBe(false);
    expect(fakeRedis.connectCalls).toBe(2);
  });
});
