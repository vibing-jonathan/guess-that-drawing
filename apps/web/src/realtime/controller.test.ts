import type {
  AckEnvelope,
  ClientToServerEvents,
  ServerToClientEvents,
} from "@gtd/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ackFailure,
  ackSuccess,
  makeEnvelope,
  makeEstablished,
  makePhoneDrawingEnvelope,
  makePhoneWritingSnapshot,
  makeSnapshot,
} from "../state/__tests__/fixtures";
import { createRoomStore } from "../state/room-store";
import {
  RealtimeRequestError,
  RoomRealtimeController,
} from "./controller";
import type { GameSocket } from "./client";

type Handler = (...args: readonly unknown[]) => void;

class MockGameSocket {
  connected = false;
  readonly emitted: Array<{
    event: keyof ClientToServerEvents;
    payload: unknown;
  }> = [];
  private readonly handlers = new Map<string, Set<Handler>>();
  private readonly acknowledgements = new Map<
    keyof ClientToServerEvents,
    AckEnvelope<unknown>[]
  >();

  connect(): this {
    if (!this.connected) {
      this.connected = true;
      this.serverEmitNative("connect");
    }
    return this;
  }

  disconnect(): this {
    if (this.connected) {
      this.connected = false;
      this.serverEmitNative("disconnect", "io client disconnect");
    }
    return this;
  }

  reconnect(): void {
    this.connected = true;
    this.serverEmitNative("connect");
  }

  on(event: string, handler: Handler): this {
    const handlers = this.handlers.get(event) ?? new Set<Handler>();
    handlers.add(handler);
    this.handlers.set(event, handlers);
    return this;
  }

  off(event: string, handler: Handler): this {
    this.handlers.get(event)?.delete(handler);
    return this;
  }

  emit(
    event: keyof ClientToServerEvents,
    payload: unknown,
    acknowledge: (response: AckEnvelope<unknown>) => void,
  ): this {
    this.emitted.push({ event, payload });
    const responses = this.acknowledgements.get(event);
    const response = responses?.shift();
    if (response) {
      queueMicrotask(() => acknowledge(response));
    }
    return this;
  }

  respondOnce(
    event: keyof ClientToServerEvents,
    response: AckEnvelope<unknown>,
  ): void {
    const responses = this.acknowledgements.get(event) ?? [];
    responses.push(response);
    this.acknowledgements.set(event, responses);
  }

  serverEmit<Event extends keyof ServerToClientEvents>(
    event: Event,
    ...args: Parameters<ServerToClientEvents[Event]>
  ): void {
    this.dispatch(event, args);
  }

  serverEmitNative(event: string, ...args: readonly unknown[]): void {
    this.dispatch(event, args);
  }

  listenerCount(event: string): number {
    return this.handlers.get(event)?.size ?? 0;
  }

  asGameSocket(): GameSocket {
    return this as unknown as GameSocket;
  }

  private dispatch(event: string, args: readonly unknown[]): void {
    for (const handler of this.handlers.get(event) ?? []) {
      handler(...args);
    }
  }
}

const profile = {
  name: "Maya",
  avatar: {
    skinTone: "peach",
    hairStyle: "short",
    hairColor: "brown",
    eyes: "dots",
    mouth: "smile",
    accessory: "none",
    backgroundColor: "#DCE7FF",
  },
} as const;

afterEach(() => {
  vi.useRealTimers();
});

describe("RoomRealtimeController", () => {
  it("shows browser offline status immediately and reconnects when back online", () => {
    const socket = new MockGameSocket();
    const store = createRoomStore();
    const controller = new RoomRealtimeController({
      socket: socket.asGameSocket(),
      store,
    });
    controller.start();

    window.dispatchEvent(new Event("offline"));
    expect(store.getState().connectionStatus).toBe("offline");
    expect(store.getState().connectionMessage).toBe(
      "Offline. Reconnect to continue.",
    );

    window.dispatchEvent(new Event("online"));
    expect(store.getState().connectionStatus).toBe("connected");
    controller.stop();
  });

  it("creates a room, persists credentials, and resumes after reconnect", async () => {
    const socket = new MockGameSocket();
    const store = createRoomStore();
    const save = vi.fn();
    const initial = makeEstablished(
      makeSnapshot({ revision: 1, selfPlayerId: "player-2" }),
    );
    const recovered = makeEstablished(
      makeSnapshot({ revision: 2, selfPlayerId: "player-2" }),
      true,
    );
    socket.respondOnce("room:create", ackSuccess(initial, 1));
    socket.respondOnce("session:resume", ackSuccess(recovered, 2));

    const controller = new RoomRealtimeController({
      socket: socket.asGameSocket(),
      store,
      persistence: {
        load: vi.fn(),
        save,
        clear: vi.fn(),
      },
    });
    controller.start();

    await controller.createRoom({
      profile,
      settings: initial.snapshot.settings,
    });
    expect(store.getState().sessionStatus).toBe("in-room");
    expect(store.getState().room?.revision).toBe(1);
    expect(save).toHaveBeenCalledWith({
      roomCode: "ABC234",
      credentials: initial.credentials,
    });

    socket.connected = false;
    socket.serverEmitNative("disconnect", "transport close");
    expect(store.getState().connectionStatus).toBe("recovering");
    socket.reconnect();

    await vi.waitFor(() => {
      expect(store.getState().room?.revision).toBe(2);
    });
    expect(store.getState().connectionStatus).toBe("connected");
    expect(
      socket.emitted.find(
        (entry) => entry.event === "session:resume",
      )?.payload,
    ).toMatchObject({
      code: "ABC234",
      credentials: initial.credentials,
      lastRoomRevision: 1,
    });
    controller.stop();
  });

  it("recovers a room revision gap with one role-redacted snapshot", async () => {
    const socket = new MockGameSocket();
    const store = createRoomStore();
    const recoveredSnapshot = makeSnapshot({
      revision: 3,
      chat: [
        {
          id: "authoritative-message",
          roomRevision: 3,
          playerId: "player-1",
          playerName: "Maya",
          text: "Authoritative chat",
          createdAt: 11_000,
        },
      ],
    });
    socket.respondOnce(
      "snapshot:request",
      ackSuccess(recoveredSnapshot, 3),
    );
    const controller = new RoomRealtimeController({
      socket: socket.asGameSocket(),
      store,
    });
    controller.start();
    socket.serverEmit("room:snapshot", makeSnapshot({ revision: 1 }));

    socket.serverEmit("chat:message", {
      revision: 3,
      message: {
        id: "gap-message",
        roomRevision: 3,
        playerId: "player-2",
        playerName: "Noah",
        text: "This delta arrived across a gap",
        createdAt: 12_000,
      },
    });

    await vi.waitFor(() => {
      expect(store.getState().syncStatus).toBe("synced");
      expect(store.getState().room?.revision).toBe(3);
    });
    expect(store.getState().room?.chat).toEqual(
      recoveredSnapshot.chat,
    );
    expect(
      socket.emitted.filter(
        (entry) => entry.event === "snapshot:request",
      ),
    ).toHaveLength(1);

    socket.serverEmit("room:player-updated", {
      revision: 2,
      player: {
        ...recoveredSnapshot.players[1]!,
        score: 9_999,
      },
    });
    expect(store.getState().room?.players[1]?.score).toBe(0);
    controller.stop();
  });

  it("requests and merges drawing replay when a sequence is missing", async () => {
    const socket = new MockGameSocket();
    const store = createRoomStore();
    const drawingEvents = vi.fn();
    const firstEnvelope = makeEnvelope(1);
    socket.respondOnce(
      "drawing:replay",
      ackSuccess(
        {
          revision: 2,
          turnId: "turn-1",
          fromSequence: 2,
          throughSequence: 3,
          operations: [makeEnvelope(2), makeEnvelope(3)],
        },
        2,
      ),
    );
    const controller = new RoomRealtimeController({
      socket: socket.asGameSocket(),
      store,
      onDrawingEnvelopes: drawingEvents,
    });
    controller.start();
    socket.serverEmit(
      "room:snapshot",
      makeSnapshot({
        revision: 1,
        drawing: {
          revision: 1,
          turnId: "turn-1",
          fromSequence: 1,
          throughSequence: 1,
          operations: [firstEnvelope],
        },
      }),
    );
    drawingEvents.mockClear();

    socket.serverEmit("drawing:batch", {
      revision: 2,
      envelopes: [makeEnvelope(3)],
    });

    await vi.waitFor(() => {
      expect(store.getState().room?.drawing?.throughSequence).toBe(3);
    });
    expect(
      store
        .getState()
        .room?.drawing?.operations.map(
          (operation) => operation.serverSequence,
        ),
    ).toEqual([1, 2, 3]);
    expect(
      socket.emitted.find(
        (entry) => entry.event === "drawing:replay",
      )?.payload,
    ).toEqual({ turnId: "turn-1", afterSequence: 1 });
    expect(drawingEvents).toHaveBeenCalledWith(
      [makeEnvelope(2), makeEnvelope(3)],
      "replay",
    );
    controller.stop();
  });

  it("advances the drawer revision from drawing acknowledgements", async () => {
    const socket = new MockGameSocket();
    const store = createRoomStore();
    socket.respondOnce(
      "drawing:batch",
      ackSuccess(
        {
          revision: 2,
          acceptedThroughSequence: 1,
        },
        2,
      ),
    );
    socket.respondOnce(
      "drawing:batch",
      ackSuccess(
        {
          revision: 3,
          acceptedThroughSequence: 2,
        },
        3,
      ),
    );
    const controller = new RoomRealtimeController({
      socket: socket.asGameSocket(),
      store,
    });
    controller.start();
    socket.serverEmit(
      "room:snapshot",
      makeSnapshot({
        revision: 1,
        selfPlayerId: "player-1",
        drawerId: "player-1",
      }),
    );

    await controller.sendDrawingBatch({
      turnId: "turn-1",
      strokeId: "stroke-1",
      chunkId: 0,
      operations: [{ opId: "op-1", kind: "clear" }],
    });
    await controller.sendDrawingBatch({
      turnId: "turn-1",
      strokeId: "stroke-2",
      chunkId: 0,
      operations: [{ opId: "op-2", kind: "clear" }],
    });

    const drawingRequests = socket.emitted.filter(
      (entry) => entry.event === "drawing:batch",
    );
    expect(drawingRequests).toHaveLength(2);
    expect(drawingRequests[0]?.payload).not.toHaveProperty(
      "mutation.expectedRevision",
    );
    expect(drawingRequests[1]?.payload).not.toHaveProperty(
      "mutation.expectedRevision",
    );
    expect(store.getState().room?.revision).toBe(3);
    expect(store.getState().syncStatus).toBe("synced");
    controller.stop();
  });

  it("omits global revision preconditions from concurrent chat and guesses", async () => {
    const socket = new MockGameSocket();
    const store = createRoomStore();
    socket.respondOnce(
      "chat:send",
      ackSuccess({
        id: "message-1",
        roomRevision: 2,
        playerId: "player-2",
        playerName: "Noah",
        text: "spaceship",
        createdAt: 10_000,
      }, 2),
    );
    socket.respondOnce(
      "guess:submit",
      ackSuccess(
        {
          kind: "close",
          turnId: "turn-1",
          message: "Very close!",
          scoreDelta: 0,
          placement: null,
        },
        2,
      ),
    );
    const controller = new RoomRealtimeController({
      socket: socket.asGameSocket(),
      store,
    });
    controller.start();
    socket.serverEmit("room:snapshot", makeSnapshot({ revision: 1 }));

    await controller.sendChat("spaceship");
    await controller.submitGuess("turn-1", "elephnt");

    for (const event of ["chat:send", "guess:submit"] as const) {
      const request = socket.emitted.find((entry) => entry.event === event);
      expect(request?.payload).not.toHaveProperty(
        "mutation.expectedRevision",
      );
      expect(request?.payload).toHaveProperty("mutation.idempotencyId");
    }
    controller.stop();
  });

  it("sends every Phone mutation with idempotency metadata and keeps drawing batches private", async () => {
    const socket = new MockGameSocket();
    const store = createRoomStore();
    const drawingEvents = vi.fn();
    const assignmentId = "assignment-1";
    socket.respondOnce(
      "phone:text:submit",
      ackSuccess({
        revision: 2,
        assignmentId,
        submittedAt: 12_000,
      }),
    );
    socket.respondOnce(
      "phone:drawing:batch",
      ackSuccess({
        revision: 3,
        assignmentId,
        acceptedThroughSequence: 1,
      }),
    );
    socket.respondOnce(
      "phone:drawing:submit",
      ackSuccess({
        revision: 4,
        assignmentId,
        submittedAt: 13_000,
      }),
    );
    socket.respondOnce(
      "phone:summary:navigate",
      ackSuccess({
        revision: 5,
        phone: {
          matchId: "phone-match-1",
          phase: "final-results" as const,
          storyCount: 4,
        },
      }),
    );
    const controller = new RoomRealtimeController({
      socket: socket.asGameSocket(),
      store,
      onDrawingEnvelopes: drawingEvents,
    });
    controller.start();

    await controller.submitPhoneText(assignmentId, "A lighthouse on wheels");
    await controller.sendPhoneDrawingBatch({
      assignmentId,
      strokeId: "phone-stroke-1",
      chunkId: 0,
      operations: [makePhoneDrawingEnvelope().operation],
    });
    await controller.submitPhoneDrawing(assignmentId);
    await controller.navigatePhoneSummary("finish");

    for (const event of [
      "phone:text:submit",
      "phone:drawing:batch",
      "phone:drawing:submit",
      "phone:summary:navigate",
    ] as const) {
      const request = socket.emitted.find((entry) => entry.event === event);
      expect(request?.payload).toHaveProperty("mutation.idempotencyId");
      expect(request?.payload).not.toHaveProperty(
        "mutation.expectedRevision",
      );
    }
    expect(drawingEvents).not.toHaveBeenCalled();
    controller.stop();
  });

  it("applies public and private Phone state events and removes their listeners on stop", () => {
    const socket = new MockGameSocket();
    const store = createRoomStore();
    const snapshot = makePhoneWritingSnapshot({ revision: 1 });
    const controller = new RoomRealtimeController({
      socket: socket.asGameSocket(),
      store,
    });
    controller.start();
    socket.serverEmit("room:snapshot", snapshot);

    socket.serverEmit("phone:state", {
      revision: 4,
      phone: {
        ...snapshot.phone,
        submittedCount: 1,
        participants: snapshot.phone.participants.map((participant) =>
          participant.playerId === "player-1"
            ? { ...participant, status: "submitted" as const }
            : participant,
        ),
      },
    });
    socket.serverEmit("phone:private", {
      revision: 4,
      privatePhone: {
        ...snapshot.privatePhone!,
        prompt: {
          kind: "text",
          text: "A lighthouse on wheels",
        },
        skippedEntryCount: 1,
      },
    });

    expect(store.getState().room?.revision).toBe(4);
    expect(store.getState().syncStatus).toBe("synced");
    const room = store.getState().room;
    expect(room?.mode === "phone" ? room.privatePhone?.prompt : null).toEqual({
      kind: "text",
      text: "A lighthouse on wheels",
    });
    expect(socket.listenerCount("phone:state")).toBe(1);
    expect(socket.listenerCount("phone:private")).toBe(1);

    controller.stop();
    expect(socket.listenerCount("phone:state")).toBe(0);
    expect(socket.listenerCount("phone:private")).toBe(0);
  });

  it("surfaces negative acknowledgements and acknowledgement timeouts", async () => {
    const socket = new MockGameSocket();
    const store = createRoomStore();
    socket.respondOnce(
      "room:join",
      ackFailure("ROOM_FULL", "That room is full."),
    );
    const controller = new RoomRealtimeController({
      socket: socket.asGameSocket(),
      store,
      ackTimeoutMs: 10,
    });
    controller.start();

    await expect(
      controller.joinRoom({
        code: "ABC234",
        profile,
      }),
    ).rejects.toMatchObject({
      code: "ROOM_FULL",
      message: "That room is full.",
    });
    expect(store.getState().lastError?.code).toBe("ROOM_FULL");

    vi.useFakeTimers();
    const timeout = controller.joinRoom({
      code: "ABC234",
      profile,
    });
    const timeoutExpectation = expect(timeout).rejects.toBeInstanceOf(
      RealtimeRequestError,
    );
    await vi.advanceTimersByTimeAsync(11);
    await timeoutExpectation;
    expect(store.getState().lastError?.code).toBe("ACK_TIMEOUT");
    expect(store.getState().pendingRequests).toBe(0);
    controller.stop();
  });

  it("rejects pending work and removes every listener on teardown", async () => {
    const socket = new MockGameSocket();
    const store = createRoomStore();
    const controller = new RoomRealtimeController({
      socket: socket.asGameSocket(),
      store,
      ackTimeoutMs: 30_000,
    });
    controller.start();
    const pending = controller.joinRoom({
      code: "ABC234",
      profile,
    });

    expect(socket.listenerCount("room:snapshot")).toBe(1);
    controller.stop();
    await expect(pending).rejects.toMatchObject({
      code: "CONTROLLER_STOPPED",
    });
    expect(socket.listenerCount("room:snapshot")).toBe(0);
  });
});
