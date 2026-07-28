import {
  DEFAULT_AVATAR,
  DEFAULT_ROOM_SETTINGS,
  SessionEstablishedSchema,
  type AckEnvelope,
  type ClientToServerEvents,
  type DrawingBroadcast,
  type DrawingOp,
  type SessionEstablished,
  type ServerToClientEvents,
} from "@gtd/contracts";
import { io as createClient, type Socket as ClientSocket } from "socket.io-client";
import { describe, expect, it, vi } from "vitest";
import { buildApplication } from "../src/app.js";
import type { ServerConfig } from "../src/config.js";
import {
  MemoryGamePersistence,
  type PersistedSession,
} from "../src/persistence.js";

type TestClient = ClientSocket<ServerToClientEvents, ClientToServerEvents>;

const socketConfig: ServerConfig = {
  nodeEnv: "test",
  host: "127.0.0.1",
  port: 0,
  redisUrl: "redis://127.0.0.1:6379",
  redisRequired: false,
  webOrigins: ["http://localhost:5173"],
  sessionSecret: "socket-test-secret-that-is-long-enough",
  webDistDirectory: "/definitely/not/a/web/build",
  logLevel: "silent",
  emptyRoomTtlMs: 30 * 60 * 1_000,
  roomLifetimeMs: 8 * 60 * 60 * 1_000,
  disconnectedSeatMs: 30_000,
  drawerPauseMs: 20_000,
};

describe("Socket.IO contract boundary", () => {
  it("validates payloads, acknowledges room creation, and recovers by token", async () => {
    const persistence = new MemoryGamePersistence();
    await persistence.connect();
    const runtime = await buildApplication({
      config: socketConfig,
      persistence,
    });
    const address = await runtime.app.listen({ host: "127.0.0.1", port: 0 });
    const client = createClient(address, {
      forceNew: true,
      transports: ["websocket"],
    }) as TestClient;
    await onceConnected(client);

    const invalid = await (
      client as unknown as {
        emitWithAck(event: string, request: unknown): Promise<unknown>;
      }
    ).emitWithAck("room:create", {
      mutation: { idempotencyId: "invalid-create-01" },
      profile: { name: "x", avatar: DEFAULT_AVATAR },
      settings: DEFAULT_ROOM_SETTINGS,
    });
    expect(invalid).toMatchObject({
      ok: false,
      error: { code: "INVALID_PAYLOAD" },
    });

    const created = await client.emitWithAck("room:create", {
      mutation: { idempotencyId: "socket-create-01" },
      profile: { name: "Maya", avatar: DEFAULT_AVATAR },
      settings: DEFAULT_ROOM_SETTINGS,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      throw new Error(created.error.message);
    }
    expect(SessionEstablishedSchema.safeParse(created.data).success).toBe(true);
    expect(created.data.snapshot.privateRound).toBeNull();
    const credentials = created.data.credentials;
    const roomCode = created.data.snapshot.code;

    client.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 20));

    const recoveredClient = createClient(address, {
      forceNew: true,
      transports: ["websocket"],
      auth: { reconnectToken: credentials.reconnectToken },
    }) as TestClient;
    const snapshotPromise = onceEvent(recoveredClient, "room:snapshot");
    await onceConnected(recoveredClient);
    const snapshot = await snapshotPromise;
    expect(snapshot.code).toBe(roomCode);
    expect(snapshot.selfPlayerId).toBe(credentials.playerId);

    recoveredClient.disconnect();
    await runtime.close();
  });

  it("queues an immediate explicit resume until socket establishment finishes", async () => {
    const persistence = new DelayedSessionPersistence();
    await persistence.connect();
    const runtime = await buildApplication({
      config: socketConfig,
      persistence,
    });
    const address = await runtime.app.listen({ host: "127.0.0.1", port: 0 });
    const host = createClient(address, {
      forceNew: true,
      transports: ["websocket"],
    }) as TestClient;
    const recoveringClient = createClient(address, {
      autoConnect: false,
      forceNew: true,
      transports: ["websocket"],
    }) as TestClient;

    try {
      await onceConnected(host);
      const created = await host.emitWithAck("room:create", {
        mutation: { idempotencyId: "resume-race-create" },
        profile: { name: "Maya", avatar: DEFAULT_AVATAR },
        settings: DEFAULT_ROOM_SETTINGS,
      });
      expect(created.ok).toBe(true);
      if (!created.ok) {
        throw new Error(created.error.message);
      }
      const { credentials, snapshot } = created.data;

      host.disconnect();
      await waitFor(
        () =>
          runtime.engine
            .inspectRoom(snapshot.code)
            ?.players.every((player) => player.socketId === null) === true,
        2_000,
      );

      persistence.delayNextSessionSave();
      const resumeAck = new Promise<AckEnvelope<SessionEstablished>>(
        (resolve, reject) => {
          const timeout = setTimeout(
            () => reject(new Error("Immediate session resume timed out")),
            2_000,
          );
          recoveringClient.once("connect", () => {
            recoveringClient.emit(
              "session:resume",
              {
                code: snapshot.code,
                credentials,
                lastRoomRevision: snapshot.revision,
              },
              (response) => {
                clearTimeout(timeout);
                resolve(response);
              },
            );
          });
        },
      );

      recoveringClient.connect();
      await persistence.waitForDelayedSave();
      await delay(25);
      persistence.releaseDelayedSave();

      const resumed = await resumeAck;
      expect(resumed.ok).toBe(true);
      if (resumed.ok) {
        expect(resumed.data.recovered).toBe(true);
        expect(resumed.data.credentials.playerId).toBe(credentials.playerId);
        expect(resumed.data.snapshot.code).toBe(snapshot.code);
      }
    } finally {
      persistence.releaseDelayedSave();
      host.disconnect();
      recoveringClient.disconnect();
      await runtime.close();
    }
  });

  it("catches and logs asynchronous disconnect cleanup failures", async () => {
    const persistence = new FailingSessionPersistence();
    await persistence.connect();
    const runtime = await buildApplication({
      config: socketConfig,
      persistence,
    });
    const address = await runtime.app.listen({ host: "127.0.0.1", port: 0 });
    const client = createClient(address, {
      forceNew: true,
      transports: ["websocket"],
    }) as TestClient;
    const stderrWrite = vi
      .spyOn(process.stderr, "write")
      .mockImplementation((() => true) as typeof process.stderr.write);

    try {
      await onceConnected(client);
      persistence.failNextSessionSave();
      client.disconnect();
      await persistence.waitForFailedSave();
      await waitFor(
        () =>
          stderrWrite.mock.calls.some(([message]) =>
            String(message).includes("Socket disconnect cleanup failed"),
          ),
        2_000,
      );
    } finally {
      client.disconnect();
      await runtime.close();
      stderrWrite.mockRestore();
    }
  });

  it("allows the drawer's dedicated limit of 30 drawing batches per second", async () => {
    const persistence = new MemoryGamePersistence();
    await persistence.connect();
    const runtime = await buildApplication({
      config: socketConfig,
      persistence,
    });
    const address = await runtime.app.listen({ host: "127.0.0.1", port: 0 });
    const host = createClient(address, {
      forceNew: true,
      transports: ["websocket"],
    }) as TestClient;
    const guest = createClient(address, {
      forceNew: true,
      transports: ["websocket"],
    }) as TestClient;

    try {
      await Promise.all([onceConnected(host), onceConnected(guest)]);
      const created = await host.emitWithAck("room:create", {
        mutation: { idempotencyId: "load-create-0001" },
        profile: { name: "Maya", avatar: DEFAULT_AVATAR },
        settings: DEFAULT_ROOM_SETTINGS,
      });
      expect(created.ok).toBe(true);
      if (!created.ok) {
        throw new Error(created.error.message);
      }
      const joined = await guest.emitWithAck("room:join", {
        mutation: { idempotencyId: "load-join-000001" },
        code: created.data.snapshot.code,
        profile: { name: "Noah", avatar: DEFAULT_AVATAR },
      });
      expect(joined.ok).toBe(true);

      const started = await host.emitWithAck("match:start", {
        mutation: { idempotencyId: "load-start-00001" },
      });
      expect(started.ok).toBe(true);
      if (!started.ok || !started.data.snapshot?.round) {
        throw new Error("The drawing turn did not start.");
      }
      const turnId = started.data.snapshot.round.turnId;
      const selected = await host.emitWithAck("round:select-word", {
        mutation: { idempotencyId: "load-select-0001" },
        turnId,
        choiceIndex: 0,
      });
      expect(selected.ok).toBe(true);

      for (let index = 0; index < 30; index += 1) {
        const id = `load-shape-${index.toString().padStart(3, "0")}`;
        const response = await host.emitWithAck("drawing:batch", {
          mutation: { idempotencyId: `load-batch-${index.toString().padStart(3, "0")}` },
          turnId,
          strokeId: id,
          chunkId: 0,
          operations: [
            {
              opId: id,
              kind: "shape",
              shape: "line",
              style: { color: "#1F2937", size: 4, fill: false },
              start: { x: index, y: index },
              end: { x: index + 10, y: index + 10 },
            },
          ],
        });
        expect(response.ok, `drawing batch ${index + 1}`).toBe(true);
      }
    } finally {
      host.disconnect();
      guest.disconnect();
      await runtime.close();
    }
  });

  it(
    "keeps a 12-player drawing stream ordered, responsive, replayable, and bounded",
    async () => {
      const persistence = new MemoryGamePersistence();
      await persistence.connect();
      const runtime = await buildApplication({
        config: socketConfig,
        persistence,
      });
      const address = await runtime.app.listen({ host: "127.0.0.1", port: 0 });
      const clients = Array.from({ length: 12 }, () =>
        createClient(address, {
          autoConnect: false,
          forceNew: true,
          transports: ["websocket"],
        }) as TestClient,
      );
      const [host, ...guests] = clients;
      if (!host) {
        throw new Error("The load test requires a host.");
      }

      try {
        await Promise.all(
          clients.map(async (client) => {
            const established = onceEvent(client, "connection:state", 5_000);
            client.connect();
            await established;
          }),
        );

        const created = await host.emitWithAck("room:create", {
          mutation: { idempotencyId: "twelve-create-0001" },
          profile: { name: "Host", avatar: DEFAULT_AVATAR },
          settings: { ...DEFAULT_ROOM_SETTINGS, maxPlayers: 12 },
        });
        expect(created.ok).toBe(true);
        if (!created.ok) {
          throw new Error(created.error.message);
        }
        const roomCode = created.data.snapshot.code;

        for (const [index, guest] of guests.entries()) {
          const joined = await guest.emitWithAck("room:join", {
            mutation: {
              idempotencyId: `twelve-join-${index.toString().padStart(4, "0")}`,
            },
            code: roomCode,
            profile: {
              name: `Player ${index + 2}`,
              avatar: DEFAULT_AVATAR,
            },
          });
          expect(joined.ok, `player ${index + 2} joins`).toBe(true);
        }
        expect(runtime.engine.inspectRoom(roomCode)?.players).toHaveLength(12);

        const started = await host.emitWithAck("match:start", {
          mutation: { idempotencyId: "twelve-start-0001" },
        });
        expect(started.ok).toBe(true);
        if (!started.ok || !started.data.snapshot?.round) {
          throw new Error("The 12-player drawing turn did not start.");
        }
        const turnId = started.data.snapshot.round.turnId;
        const selected = await host.emitWithAck("round:select-word", {
          mutation: { idempotencyId: "twelve-select-001" },
          turnId,
          choiceIndex: 0,
        });
        expect(selected.ok).toBe(true);

        const oversized = createOversizedDrawingRequest(turnId);
        const serializedBytes = Buffer.byteLength(JSON.stringify(oversized));
        expect(serializedBytes).toBeGreaterThan(128 * 1_024);
        expect(serializedBytes).toBeLessThan(256 * 1_024);
        const oversizedAck = await host.emitWithAck("drawing:batch", oversized);
        expect(oversizedAck).toMatchObject({
          ok: false,
          error: { code: "PAYLOAD_TOO_LARGE" },
        });
        expect(runtime.engine.inspectRoom(roomCode)?.round?.drawingLog).toHaveLength(0);

        const receivedByGuest: DrawingBroadcast[][] = guests.map(() => []);
        const drawingListeners = guests.map((guest, index) => {
          const listener = (event: DrawingBroadcast) => {
            receivedByGuest[index]?.push(event);
          };
          guest.on("drawing:batch", listener);
          return listener;
        });

        const operationsPerBatch = 64;
        const initialBatchCount = 30;
        const initialOperationCount = operationsPerBatch * initialBatchCount;
        const burstStartedAt = Date.now();
        const initialAcks = await Promise.all(
          Array.from({ length: initialBatchCount }, (_, batchIndex) =>
            host.emitWithAck(
              "drawing:batch",
              createDrawingRequest(turnId, batchIndex, operationsPerBatch),
            ),
          ),
        );
        for (const [index, ack] of initialAcks.entries()) {
          expect(ack.ok, `initial drawing batch ${index + 1}`).toBe(true);
          if (ack.ok) {
            expect(ack.data.acceptedThroughSequence).toBe(
              (index + 1) * operationsPerBatch,
            );
          }
        }

        await waitFor(
          () =>
            receivedByGuest.every(
              (events) =>
                events.reduce(
                  (count, event) => count + event.envelopes.length,
                  0,
                ) === initialOperationCount,
            ),
          5_000,
        );
        expect(Date.now() - burstStartedAt).toBeLessThan(5_000);

        const expectedInitialSequences = Array.from(
          { length: initialOperationCount },
          (_, index) => index + 1,
        );
        for (const [index, events] of receivedByGuest.entries()) {
          expect(events, `guest ${index + 2} receives all 30 batches`).toHaveLength(
            initialBatchCount,
          );
          expect(events.flatMap((event) => event.envelopes.map((item) => item.serverSequence)))
            .toEqual(expectedInitialSequences);
          expect(events.map((event) => event.revision)).toEqual(
            [...events.map((event) => event.revision)].sort(
              (left, right) => left - right,
            ),
          );
        }
        guests.forEach((guest, index) => {
          const listener = drawingListeners[index];
          if (listener) {
            guest.off("drawing:batch", listener);
          }
        });

        const maximumRetainedOperations = 10_000;
        let submittedOperations = initialOperationCount;
        let nextBatchIndex = initialBatchCount;
        while (submittedOperations < maximumRetainedOperations) {
          await delay(1_050);
          const batchesRemaining = Math.ceil(
            (maximumRetainedOperations - submittedOperations) / operationsPerBatch,
          );
          const windowBatchCount = Math.min(30, batchesRemaining);
          const requests = Array.from({ length: windowBatchCount }, () => {
            const operationCount = Math.min(
              operationsPerBatch,
              maximumRetainedOperations - submittedOperations,
            );
            const request = createDrawingRequest(
              turnId,
              nextBatchIndex,
              operationCount,
            );
            nextBatchIndex += 1;
            submittedOperations += operationCount;
            return request;
          });
          const acks = await Promise.all(
            requests.map((request) => host.emitWithAck("drawing:batch", request)),
          );
          acks.forEach((ack, index) => {
            expect(ack.ok, `bounded-log batch ${index + 1}`).toBe(true);
          });
        }

        const room = runtime.engine.inspectRoom(roomCode);
        expect(room?.round?.drawingLog).toHaveLength(maximumRetainedOperations);
        expect(room?.round?.nextServerSequence).toBe(maximumRetainedOperations + 1);
        expect(room?.round?.drawingLog.at(-1)?.serverSequence).toBe(
          maximumRetainedOperations,
        );

        const replay = await guests[0]!.emitWithAck("drawing:replay", {
          turnId,
          afterSequence: maximumRetainedOperations - 16,
        });
        expect(replay.ok).toBe(true);
        if (replay.ok) {
          expect(replay.data).toMatchObject({
            turnId,
            fromSequence: maximumRetainedOperations - 15,
            throughSequence: maximumRetainedOperations,
          });
          expect(replay.data.operations.map((item) => item.serverSequence)).toEqual(
            Array.from(
              { length: 16 },
              (_, index) => maximumRetainedOperations - 15 + index,
            ),
          );
        }

        const beyondLimit = await host.emitWithAck(
          "drawing:batch",
          createDrawingRequest(turnId, nextBatchIndex, 1),
        );
        expect(beyondLimit).toMatchObject({
          ok: false,
          error: { code: "PAYLOAD_TOO_LARGE" },
        });
        expect(runtime.engine.inspectRoom(roomCode)?.round?.drawingLog).toHaveLength(
          maximumRetainedOperations,
        );
      } finally {
        clients.forEach((client) => client.disconnect());
        await delay(25);
        await runtime.close();
      }
    },
    45_000,
  );
});

class DelayedSessionPersistence extends MemoryGamePersistence {
  #delayNextSave = false;
  #delayedSaveStarted: Promise<void> = Promise.resolve();
  #markDelayedSaveStarted: (() => void) | null = null;
  #saveGate: Promise<void> = Promise.resolve();
  #releaseSave: (() => void) | null = null;

  delayNextSessionSave(): void {
    this.#delayNextSave = true;
    this.#delayedSaveStarted = new Promise((resolve) => {
      this.#markDelayedSaveStarted = resolve;
    });
    this.#saveGate = new Promise((resolve) => {
      this.#releaseSave = resolve;
    });
  }

  waitForDelayedSave(): Promise<void> {
    return this.#delayedSaveStarted;
  }

  releaseDelayedSave(): void {
    this.#releaseSave?.();
    this.#releaseSave = null;
  }

  override async saveSession(session: PersistedSession): Promise<void> {
    if (this.#delayNextSave) {
      this.#delayNextSave = false;
      this.#markDelayedSaveStarted?.();
      this.#markDelayedSaveStarted = null;
      await this.#saveGate;
    }
    await super.saveSession(session);
  }
}

class FailingSessionPersistence extends MemoryGamePersistence {
  #failNextSave = false;
  #failedSave: Promise<void> = Promise.resolve();
  #markFailedSave: (() => void) | null = null;

  failNextSessionSave(): void {
    this.#failNextSave = true;
    this.#failedSave = new Promise((resolve) => {
      this.#markFailedSave = resolve;
    });
  }

  waitForFailedSave(): Promise<void> {
    return this.#failedSave;
  }

  override async saveSession(session: PersistedSession): Promise<void> {
    if (this.#failNextSave) {
      this.#failNextSave = false;
      this.#markFailedSave?.();
      this.#markFailedSave = null;
      throw new Error("simulated disconnect persistence failure");
    }
    await super.saveSession(session);
  }
}

function onceConnected(socket: TestClient): Promise<void> {
  if (socket.connected) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Socket connection timed out")), 2_000);
    socket.once("connect", () => {
      clearTimeout(timeout);
      resolve();
    });
    socket.once("connect_error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

function onceEvent<EventName extends keyof ServerToClientEvents>(
  socket: TestClient,
  event: EventName,
  timeoutMs = 2_000,
): Promise<Parameters<ServerToClientEvents[EventName]>[0]> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`${String(event)} timed out`)),
      timeoutMs,
    );
    socket.once(event, ((payload: Parameters<ServerToClientEvents[EventName]>[0]) => {
      clearTimeout(timeout);
      resolve(payload);
    }) as never);
  });
}

function createDrawingRequest(turnId: string, batchIndex: number, count: number) {
  const strokeId = `load-stroke-${batchIndex.toString().padStart(4, "0")}`;
  const operations: DrawingOp[] = Array.from({ length: count }, (_, operationIndex) => {
    const coordinate = (batchIndex * 64 + operationIndex) % 1_100;
    return {
      opId: `${strokeId}-op-${operationIndex.toString().padStart(2, "0")}`,
      kind: "shape",
      shape: "line",
      style: { color: "#1F2937", size: 4, fill: false },
      start: { x: coordinate, y: coordinate },
      end: { x: coordinate + 10, y: coordinate + 10 },
    };
  });
  return {
    mutation: {
      idempotencyId: `load-batch-${batchIndex.toString().padStart(4, "0")}`,
    },
    turnId,
    strokeId,
    chunkId: 0,
    operations,
  };
}

function createOversizedDrawingRequest(turnId: string) {
  const operations: DrawingOp[] = Array.from({ length: 64 }, (_, operationIndex) => ({
    opId: `oversized-op-${operationIndex.toString().padStart(2, "0")}`,
    kind: "stroke",
    tool: "brush",
    style: { color: "#1F2937", size: 4, fill: false },
    points: Array.from({ length: 100 }, (_, pointIndex) => ({
      x: 1_000 + (pointIndex % 100),
      y: 1_000 + (pointIndex % 100),
    })),
  }));
  return {
    mutation: { idempotencyId: "oversized-payload-01" },
    turnId,
    strokeId: "oversized-stroke",
    chunkId: 0,
    operations,
  };
}

async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error(`Condition timed out after ${timeoutMs}ms`);
    }
    await delay(10);
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
