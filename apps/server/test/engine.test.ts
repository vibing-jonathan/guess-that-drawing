import {
  DEFAULT_AVATAR,
  DEFAULT_ROOM_SETTINGS,
  VALIDATION_LIMITS,
  ChatMessageEventSchema,
  CorrectGuessBroadcastSchema,
  DrawingBroadcastSchema,
  GuessFeedbackEventSchema,
  PlayerEventSchema,
  PlayerLeftEventSchema,
  PlayerRoomSnapshotSchema,
  RoundEventSchema,
  RoundPrivateEventSchema,
  ScoreUpdatedEventSchema,
  TurnEndedEventSchema,
  calculateDrawerScore,
  calculateGuesserScore,
  classifyGuess,
  normalizeGuess,
  normalizeRoomCode,
  validateCustomTheme,
  type DrawingOp,
  type RoomSettings,
} from "@gtd/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AuthoritativeRoom,
  EngineDelivery,
  EngineTransport,
} from "../src/domain.js";
import { GameEngine, type EngineRules } from "../src/engine.js";
import {
  MemoryGamePersistence,
  type PersistedRoomEnvelope,
} from "../src/persistence.js";

class CapturingTransport implements EngineTransport {
  readonly deliveries: EngineDelivery[] = [];
  readonly rooms = new Map<string, Set<string>>();

  emit(delivery: EngineDelivery): void {
    this.deliveries.push(structuredClone(delivery));
  }

  join(socketId: string, roomCode: string): void {
    const sockets = this.rooms.get(roomCode) ?? new Set<string>();
    sockets.add(socketId);
    this.rooms.set(roomCode, sockets);
  }

  leave(socketId: string, roomCode: string): void {
    this.rooms.get(roomCode)?.delete(socketId);
  }
}

class GatePersistence extends MemoryGamePersistence {
  #blockNext = false;
  #blocked: (() => void) | null = null;
  #release: (() => void) | null = null;

  blockNextSave(): Promise<void> {
    this.#blockNext = true;
    return new Promise((resolve) => {
      this.#blocked = resolve;
    });
  }

  releaseSave(): void {
    this.#release?.();
    this.#release = null;
  }

  override async saveRoom<T>(
    room: PersistedRoomEnvelope & { value: T },
  ): Promise<void> {
    if (this.#blockNext) {
      this.#blockNext = false;
      await new Promise<void>((resolve) => {
        this.#release = resolve;
        this.#blocked?.();
        this.#blocked = null;
      });
    }
    await super.saveRoom(room);
  }
}

const customWords = [
  "Elephant",
  "Bicycle",
  "Rainbow",
  "Volcano",
  "Telescope",
  "Pineapple",
  "Snowman",
  "Lighthouse",
  "Butterfly",
  "Spaceship",
  "Waterfall",
  "Umbrella",
  "Castle",
  "Guitar",
  "Octopus",
  "Treasure Map",
  "Roller Coaster",
  "Hot Air Balloon",
  "Birthday Cake",
  "Traffic Light",
];

const testSettings: RoomSettings = {
  ...DEFAULT_ROOM_SETTINGS,
  drawingCycles: 1,
  theme: {
    id: "test-theme",
    name: "Test Theme",
    isCustom: true,
    wordCount: customWords.length,
  },
};

function makeRules(): EngineRules {
  return {
    generateRoomCode: () => "ABC234",
    normalizeRoomCode,
    normalizeText: normalizeGuess,
    classifyGuess,
    calculateGuesserScore,
    calculateDrawerScore,
    getTheme: () => null,
    validateCustomTheme(theme) {
      const result = validateCustomTheme(theme);
      return result.success
        ? { valid: true, normalizedWords: result.data.words, errors: [] }
        : {
            valid: false,
            normalizedWords: [],
            errors: result.issues.map((issue) => issue.message),
          };
    },
  };
}

async function createFixture(
  persistence: MemoryGamePersistence = new MemoryGamePersistence(
    () => Date.now(),
  ),
) {
  let id = 0;
  await persistence.connect();
  const transport = new CapturingTransport();
  const engine = new GameEngine({
    persistence,
    transport,
    rules: makeRules(),
    config: {
      sessionSecret: "test-session-secret-that-is-long-enough",
      roomLifetimeMs: 8 * 60 * 60 * 1_000,
      emptyRoomTtlMs: 30 * 60 * 1_000,
      disconnectedSeatMs: 30_000,
      drawerPauseMs: 20_000,
    },
    now: () => Date.now(),
    id: () => `id-${++id}`,
    random: () => 0,
  });
  await engine.start();
  return { engine, persistence, transport };
}

async function createTwoPlayerGame(engine: GameEngine) {
  const hostSession = await engine.connect("socket-host");
  const guestSession = await engine.connect("socket-guest");
  const created = await engine.createRoom("socket-host", {
    idempotencyId: "create-room-0001",
    name: "Maya",
    avatar: DEFAULT_AVATAR,
    settings: testSettings,
    customTheme: {
      id: "test-theme",
      name: "Test Theme",
      words: customWords,
    },
  });
  await engine.joinRoom("socket-guest", {
    idempotencyId: "join-room-00001",
    roomCode: created.data.snapshot.code,
    name: "Noah",
    avatar: { ...DEFAULT_AVATAR, eyes: "wink" },
  });
  return {
    hostSession,
    guestSession,
    code: created.data.snapshot.code,
    hostId: created.data.credentials.playerId,
  };
}

describe("GameEngine", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-28T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates, joins, starts, and redacts drawer-only choices and answers", async () => {
    const { engine, persistence } = await createFixture();
    const { code, hostId, hostSession, guestSession } = await createTwoPlayerGame(engine);
    const persistedRoom = await persistence.getRoom(code);
    expect(JSON.stringify(persistedRoom)).not.toContain(hostSession.reconnectToken);
    expect(JSON.stringify(persistedRoom)).not.toContain(guestSession.reconnectToken);
    await expect(
      engine.startMatch("socket-host", "create-room-0001"),
    ).rejects.toMatchObject({ code: "DUPLICATE_EVENT" });

    await expect(
      engine.connect("socket-duplicate").then(() =>
        engine.joinRoom("socket-duplicate", {
          idempotencyId: "join-room-00002",
          roomCode: code,
          name: "MÁYA!!!",
          avatar: DEFAULT_AVATAR,
        }),
      ),
    ).rejects.toMatchObject({ code: "DUPLICATE_NAME" });

    await engine.startMatch("socket-host", "start-match-0001");
    const selectingRoom = engine.inspectRoom(code)!;
    expect(selectingRoom.phase).toBe("selecting");
    expect(selectingRoom.round?.drawerId).toBe(hostId);

    const hostSnapshot = await engine.snapshotForSocket("socket-host");
    const guestSnapshot = await engine.snapshotForSocket("socket-guest");
    expect(hostSnapshot.privateRound?.wordChoices).toEqual([
      "Elephant",
      "Bicycle",
      "Rainbow",
    ]);
    expect(guestSnapshot.privateRound).toBeNull();
    expect(JSON.stringify(guestSnapshot)).not.toContain("Elephant");

    await engine.selectWord(
      "socket-host",
      "select-word-0001",
      selectingRoom.round!.turnId,
      0,
    );
    const drawingGuestSnapshot = await engine.snapshotForSocket("socket-guest");
    expect(drawingGuestSnapshot.round?.wordMask?.pattern).toBe("________");
    expect(JSON.stringify(drawingGuestSnapshot)).not.toContain("Elephant");
    expect((await engine.snapshotForSocket("socket-host")).privateRound?.answer).toBe(
      "Elephant",
    );

    await engine.stop();
  });

  it("replays a leave acknowledgement without applying the mutation twice", async () => {
    const { engine } = await createFixture();
    const { code } = await createTwoPlayerGame(engine);
    const first = await engine.leaveRoom("socket-guest", "leave-room-00001");
    const duplicate = await engine.leaveRoom("socket-guest", "leave-room-00001");
    expect(duplicate).toEqual(first);
    expect(engine.inspectRoom(code)?.players.map((player) => player.name)).toEqual([
      "Maya",
    ]);
    await engine.stop();
  });

  it("emits concurrent chat revisions in authoritative mutation order", async () => {
    const persistence = new GatePersistence(() => Date.now());
    const { engine, transport } = await createFixture(persistence);
    await createTwoPlayerGame(engine);
    transport.deliveries.length = 0;
    const firstSaveBlocked = persistence.blockNextSave();
    const first = engine.sendChat(
      "socket-host",
      "chat-concurrent-01",
      "first",
    );
    await firstSaveBlocked;
    const second = engine.sendChat(
      "socket-guest",
      "chat-concurrent-02",
      "second",
    );
    persistence.releaseSave();
    await Promise.all([first, second]);

    const chatEvents = transport.deliveries.filter(
      (delivery) => delivery.event === "chat:message",
    );
    expect(
      chatEvents.map((delivery) => ({
        revision: (delivery.payload as { revision: number }).revision,
        text: (delivery.payload as { message: { text: string } }).message.text,
      })),
    ).toEqual([
      { revision: 3, text: "first" },
      { revision: 4, text: "second" },
    ]);
    const persisted = await persistence.getRoom<AuthoritativeRoom>("ABC234");
    expect(persisted?.revision).toBe(4);
    expect(persisted?.chat.map((message) => message.text)).toEqual([
      "first",
      "second",
    ]);

    await engine.stop();
  });

  it("accepts a guess racing an in-flight drawing save without stale revisions", async () => {
    const persistence = new GatePersistence(() => Date.now());
    const { engine } = await createFixture(persistence);
    const { code } = await createTwoPlayerGame(engine);
    await engine.startMatch("socket-host", "start-match-0001");
    const turnId = engine.inspectRoom(code)!.round!.turnId;
    await engine.selectWord("socket-host", "select-word-0001", turnId, 0);

    const firstSaveBlocked = persistence.blockNextSave();
    const drawing = engine.submitDrawingBatch("socket-host", {
      idempotencyId: "drawing-race-0001",
      turnId,
      strokeId: "stroke-race-1",
      chunkId: 0,
      operations: [
        {
          opId: "stroke-race-op-1",
          kind: "stroke",
          tool: "brush",
          style: { color: "#1F2937", size: 12, fill: false },
          points: [
            { x: 10, y: 10 },
            { x: 20, y: 20 },
          ],
        },
      ],
    });
    await firstSaveBlocked;
    const guess = engine.submitGuess(
      "socket-guest",
      "guess-race-00001",
      turnId,
      "spaceship",
    );

    persistence.releaseSave();
    await expect(Promise.all([drawing, guess])).resolves.toBeDefined();
    const persisted = await persistence.getRoom<AuthoritativeRoom>(code);
    expect(persisted?.round?.drawingLog).toHaveLength(1);
    expect(persisted?.chat.map((message) => message.text)).toContain(
      "spaceship",
    );

    await engine.stop();
  });

  it("rejects mismatched resume credentials without attaching the caller to the seat", async () => {
    const { engine } = await createFixture();
    const { guestSession } = await createTwoPlayerGame(engine);
    await engine.connect("socket-resume-attempt");

    await expect(
      engine.resumeSession(
        "socket-resume-attempt",
        "ABC234",
        "wrong-player-id",
        guestSession.reconnectToken,
      ),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      engine.snapshotForSocket("socket-resume-attempt"),
    ).rejects.toMatchObject({ code: "NOT_IN_ROOM" });
    await expect(engine.snapshotForSocket("socket-guest")).resolves.toMatchObject({
      code: "ABC234",
    });

    await engine.stop();
  });

  it("enforces host permissions, revisions, and authoritative theme validation", async () => {
    const { engine } = await createFixture();
    const { code } = await createTwoPlayerGame(engine);
    await expect(
      engine.startMatch("socket-guest", "guest-start-00001"),
    ).rejects.toMatchObject({ code: "NOT_HOST" });
    await expect(
      engine.updateSettings(
        "socket-guest",
        "guest-settings-01",
        testSettings,
        {
          id: "test-theme",
          name: "Test Theme",
          words: customWords,
        },
      ),
    ).rejects.toMatchObject({ code: "NOT_HOST" });
    await expect(
      engine.updateProfile(
        "socket-guest",
        "stale-profile-001",
        { name: "Noah", avatar: DEFAULT_AVATAR },
        engine.inspectRoom(code)!.revision - 1,
      ),
    ).rejects.toMatchObject({ code: "STALE_REVISION" });

    await engine.updateSettings(
      "socket-host",
      "host-settings-001",
      { ...testSettings, turnSeconds: 90 },
    );
    expect(engine.inspectRoom(code)?.settings.turnSeconds).toBe(90);
    expect(engine.inspectRoom(code)?.customTheme?.words).toEqual(customWords);

    const invalidEngine = (await createFixture()).engine;
    await invalidEngine.connect("invalid-host");
    await expect(
      invalidEngine.createRoom("invalid-host", {
        idempotencyId: "invalid-theme-001",
        name: "Maya",
        avatar: DEFAULT_AVATAR,
        settings: testSettings,
        customTheme: {
          id: "test-theme",
          name: "Test Theme",
          words: Array.from({ length: 20 }, () => "Duplicate"),
        },
      }),
    ).rejects.toMatchObject({ code: "INVALID_THEME" });

    await invalidEngine.stop();
    await engine.stop();
  });

  it("advances expired phases before accepting late commands", async () => {
    const { engine } = await createFixture();
    const { code } = await createTwoPlayerGame(engine);
    await engine.startMatch("socket-host", "start-match-0001");
    const turnId = engine.inspectRoom(code)!.round!.turnId;
    await engine.selectWord("socket-host", "select-word-0001", turnId, 0);
    const deadline = engine.inspectRoom(code)!.round!.deadlineAt;

    vi.setSystemTime(deadline + 1);
    await expect(
      engine.submitGuess(
        "socket-guest",
        "late-correct-0001",
        turnId,
        "elephant",
      ),
    ).rejects.toMatchObject({ code: "INVALID_PHASE" });
    expect(engine.inspectRoom(code)?.phase).toBe("turn-results");
    expect(
      engine.inspectRoom(code)?.players.find((player) => player.name === "Noah")
        ?.score,
    ).toBe(0);

    await engine.stop();
  });

  it("expires a disconnected seat authoritatively before a delayed timer fires", async () => {
    const { engine } = await createFixture();
    const { code, guestSession } = await createTwoPlayerGame(engine);
    const disconnectedAt = Date.now();
    await engine.disconnect("socket-guest");

    vi.setSystemTime(disconnectedAt + 30_001);
    await expect(
      engine.connect("socket-guest-late", guestSession.reconnectToken),
    ).rejects.toMatchObject({ code: "ROOM_EXPIRED" });
    expect(engine.inspectRoom(code)?.players.map((player) => player.name)).toEqual([
      "Maya",
    ]);

    await engine.stop();
  });

  it("keeps close and correct guesses private and applies placement/speed scoring", async () => {
    const { engine, transport } = await createFixture();
    const { code } = await createTwoPlayerGame(engine);
    await engine.startMatch("socket-host", "start-match-0001");
    const turnId = engine.inspectRoom(code)!.round!.turnId;
    await engine.selectWord("socket-host", "select-word-0001", turnId, 0);

    transport.deliveries.length = 0;
    const close = await engine.submitGuess(
      "socket-guest",
      "guess-close-0001",
      turnId,
      "elephnt",
    );
    expect(close.data.feedback.kind).toBe("close");
    expect(engine.inspectRoom(code)?.chat).toHaveLength(0);
    expect(
      transport.deliveries.filter((delivery) => delivery.event === "guess:feedback"),
    ).toHaveLength(1);
    expect(
      transport.deliveries.some((delivery) => delivery.event === "chat:message"),
    ).toBe(false);

    const correct = await engine.submitGuess(
      "socket-guest",
      "guess-right-0001",
      turnId,
      "ÉLÉPHANT!!!",
    );
    expect(correct.data.feedback).toMatchObject({
      kind: "correct",
      placement: 1,
      scoreAwarded: 1_000,
    });
    const room = engine.inspectRoom(code)!;
    expect(room.phase).toBe("turn-results");
    expect(room.players.find((player) => player.name === "Noah")?.score).toBe(1_000);
    expect(room.players.find((player) => player.name === "Maya")?.score).toBe(75);
    const publicCorrectEvent = transport.deliveries.find(
      (delivery) => delivery.event === "guess:correct",
    );
    expect(JSON.stringify(publicCorrectEvent)).not.toContain("Elephant");

    await engine.stop();
  });

  it("orders multiple correct guessers and suppresses answer-equivalent follow-ups", async () => {
    const { engine, persistence } = await createFixture();
    const { code } = await createTwoPlayerGame(engine);
    await engine.connect("socket-third");
    await engine.joinRoom("socket-third", {
      idempotencyId: "join-room-third01",
      roomCode: code,
      name: "Ari",
      avatar: { ...DEFAULT_AVATAR, accessory: "crown" },
    });
    await engine.startMatch("socket-host", "start-match-0001");
    const turnId = engine.inspectRoom(code)!.round!.turnId;
    await engine.selectWord("socket-host", "select-word-0001", turnId, 0);

    const first = await engine.submitGuess(
      "socket-guest",
      "first-correct-001",
      turnId,
      "elephant",
    );
    expect(first.data.feedback.scoreAwarded).toBe(1_000);
    expect(engine.inspectRoom(code)?.phase).toBe("drawing");

    const chatCount = engine.inspectRoom(code)!.chat.length;
    const suppressed = await engine.submitGuess(
      "socket-guest",
      "repeat-answer-001",
      turnId,
      "ELEPHANT!",
    );
    expect(suppressed.data.feedback.kind).toBe("correct");
    expect(engine.inspectRoom(code)?.chat).toHaveLength(chatCount);
    await engine.submitGuess(
      "socket-guest",
      "post-correct-chat1",
      turnId,
      "spaceship",
    );
    const persistedRoom =
      await persistence.getRoom<AuthoritativeRoom>(code);
    const persistedRetry = Object.values(
      persistedRoom?.recentCommands ?? {},
    )
      .flat()
      .find((command) => command.id === "post-correct-chat1");
    expect(persistedRetry?.result).toMatchObject({
      data: { feedback: { kind: "incorrect" } },
    });

    const second = await engine.submitGuess(
      "socket-third",
      "second-correct-01",
      turnId,
      "elephant",
    );
    expect(second.data.feedback).toMatchObject({
      placement: 2,
      scoreAwarded: 900,
    });
    expect(engine.inspectRoom(code)?.phase).toBe("turn-results");
    expect(engine.inspectRoom(code)?.players.find((player) => player.name === "Maya")?.score)
      .toBe(150);

    await engine.stop();
  });

  it("awards the drawer for prior correct guesses when a paused turn is skipped", async () => {
    const { engine } = await createFixture();
    const { code } = await createTwoPlayerGame(engine);
    await engine.connect("socket-third");
    await engine.joinRoom("socket-third", {
      idempotencyId: "join-room-third01",
      roomCode: code,
      name: "Ari",
      avatar: { ...DEFAULT_AVATAR, accessory: "crown" },
    });
    await engine.startMatch("socket-host", "start-match-0001");
    const turnId = engine.inspectRoom(code)!.round!.turnId;
    await engine.selectWord("socket-host", "select-word-0001", turnId, 0);
    await engine.submitGuess(
      "socket-guest",
      "guess-right-0001",
      turnId,
      "elephant",
    );

    await engine.disconnect("socket-host");
    await vi.advanceTimersByTimeAsync(20_001);

    const drawer = engine.inspectRoom(code)?.players.find(
      (player) => player.name === "Maya",
    );
    expect(engine.inspectRoom(code)?.phase).toBe("turn-results");
    expect(drawer?.score).toBe(75);

    await engine.stop();
  });

  it("lets mid-match joiners guess immediately and adds them to the turn queue", async () => {
    const { engine } = await createFixture();
    const { code } = await createTwoPlayerGame(engine);
    await engine.startMatch("socket-host", "start-match-0001");
    const turnId = engine.inspectRoom(code)!.round!.turnId;
    await engine.selectWord("socket-host", "select-word-0001", turnId, 0);

    await engine.connect("socket-late");
    const joined = await engine.joinRoom("socket-late", {
      idempotencyId: "join-room-late001",
      roomCode: code,
      name: "Lena",
      avatar: { ...DEFAULT_AVATAR, hairStyle: "curls" },
    });
    const latePlayerId = joined.data.credentials.playerId;
    expect(engine.inspectRoom(code)?.pendingTurnPlayerIds).toEqual([latePlayerId]);
    await engine.submitGuess(
      "socket-late",
      "late-correct-0001",
      turnId,
      "elephant",
    );
    expect(
      engine.inspectRoom(code)?.round?.correctGuesses.some(
        (guess) => guess.playerId === latePlayerId,
      ),
    ).toBe(true);

    await vi.advanceTimersByTimeAsync(80_001);
    expect(engine.inspectRoom(code)?.phase).toBe("turn-results");
    await vi.advanceTimersByTimeAsync(6_001);
    expect(engine.inspectRoom(code)?.turnOrder).toContain(latePlayerId);

    await engine.stop();
  });

  it("orders drawing chunks, deduplicates mutations, and undoes a whole stroke", async () => {
    const { engine } = await createFixture();
    const { code } = await createTwoPlayerGame(engine);
    await engine.startMatch("socket-host", "start-match-0001");
    const turnId = engine.inspectRoom(code)!.round!.turnId;
    await engine.selectWord("socket-host", "select-word-0001", turnId, 0);

    const stroke: DrawingOp = {
      opId: "stroke-1",
      kind: "stroke",
      tool: "brush",
      style: { color: "#1F2937", size: 12, fill: false },
      points: [
        { x: 10, y: 10 },
        { x: 20, y: 20 },
      ],
    };
    const command = {
      idempotencyId: "drawing-batch-0001",
      turnId,
      strokeId: "stroke-1",
      chunkId: 0,
      operations: [stroke],
    };
    const first = await engine.submitDrawingBatch("socket-host", command);
    const duplicate = await engine.submitDrawingBatch("socket-host", command);
    expect(duplicate).toEqual(first);
    expect(engine.inspectRoom(code)?.round?.drawingLog).toHaveLength(1);

    await expect(
      engine.submitDrawingBatch("socket-host", {
        ...command,
        idempotencyId: "drawing-batch-gap1",
        chunkId: 2,
      }),
    ).rejects.toMatchObject({ code: "DRAWING_SEQUENCE_GAP" });
    await expect(
      engine.submitDrawingBatch("socket-guest", {
        ...command,
        idempotencyId: "drawing-not-drawer1",
      }),
    ).rejects.toMatchObject({ code: "NOT_DRAWER" });
    await expect(
      engine.submitDrawingBatch("socket-host", {
        ...command,
        idempotencyId: "drawing-op-id-reuse",
        strokeId: "another-stroke",
      }),
    ).rejects.toMatchObject({ code: "DRAWING_SEQUENCE_GAP" });
    await expect(
      engine.replayForSocket("socket-guest", turnId, 99),
    ).rejects.toMatchObject({
      code: "DRAWING_SEQUENCE_GAP",
      details: {
        currentRevision: engine.inspectRoom(code)!.revision,
        latestSequence: 1,
      },
    });

    await engine.submitDrawingBatch("socket-host", {
      idempotencyId: "drawing-undo-00001",
      turnId,
      strokeId: "undo-action-1",
      chunkId: 0,
      operations: [
        {
          opId: "undo-op-1",
          kind: "undo",
          targetOpId: "stroke-1",
        },
      ],
    });
    expect(engine.inspectRoom(code)?.round?.undoStack).toEqual([]);
    expect(engine.inspectRoom(code)?.round?.redoStack).toEqual(["stroke-1"]);

    await engine.stop();
  });

  it("enforces cumulative drawing point and byte budgets", async () => {
    const { engine } = await createFixture();
    const { code } = await createTwoPlayerGame(engine);
    await engine.startMatch("socket-host", "start-match-0001");
    const turnId = engine.inspectRoom(code)!.round!.turnId;
    await engine.selectWord("socket-host", "select-word-0001", turnId, 0);
    engine.inspectRoom(code)!.round!.drawingPointCount =
      VALIDATION_LIMITS.drawingLogPoints;

    await expect(
      engine.submitDrawingBatch("socket-host", {
        idempotencyId: "drawing-budget-001",
        turnId,
        strokeId: "budget-stroke-1",
        chunkId: 0,
        operations: [
          {
            opId: "budget-op-1",
            kind: "stroke",
            tool: "brush",
            style: { color: "#1F2937", size: 12, fill: false },
            points: [{ x: 10, y: 10 }],
          },
        ],
      }),
    ).rejects.toMatchObject({ code: "PAYLOAD_TOO_LARGE" });

    await engine.stop();
  });

  it("emits payloads that satisfy the shared server-event schemas", async () => {
    const { engine, transport } = await createFixture();
    const { code, hostSession } = await createTwoPlayerGame(engine);
    await engine.startMatch("socket-host", "start-match-0001");
    await engine.disconnect("socket-host");
    await engine.connect("socket-host-restored", hostSession.reconnectToken);
    const turnId = engine.inspectRoom(code)!.round!.turnId;
    await engine.selectWord("socket-host-restored", "select-word-0001", turnId, 0);
    await engine.submitDrawingBatch("socket-host-restored", {
      idempotencyId: "drawing-schema-001",
      turnId,
      strokeId: "schema-stroke",
      chunkId: 0,
      operations: [
        {
          opId: "schema-stroke",
          kind: "shape",
          shape: "ellipse",
          style: { color: "#155EEF", size: 8, fill: false },
          start: { x: 100, y: 100 },
          end: { x: 300, y: 240 },
        },
      ],
    });
    await engine.submitGuess(
      "socket-guest",
      "guess-wrong-0001",
      turnId,
      "spaceship",
    );
    await engine.submitGuess(
      "socket-guest",
      "guess-close-0001",
      turnId,
      "elephnt",
    );
    await engine.submitGuess(
      "socket-guest",
      "guess-right-0001",
      turnId,
      "elephant",
    );

    const schemas = {
      "room:snapshot": PlayerRoomSnapshotSchema,
      "room:player-joined": PlayerEventSchema,
      "room:player-left": PlayerLeftEventSchema,
      "round:selection-started": RoundEventSchema,
      "round:paused": RoundEventSchema,
      "round:resumed": RoundEventSchema,
      "round:started": RoundEventSchema,
      "round:private": RoundPrivateEventSchema,
      "drawing:batch": DrawingBroadcastSchema,
      "chat:message": ChatMessageEventSchema,
      "guess:feedback": GuessFeedbackEventSchema,
      "guess:correct": CorrectGuessBroadcastSchema,
      "round:ended": TurnEndedEventSchema,
      "score:updated": ScoreUpdatedEventSchema,
    } as const;
    for (const delivery of transport.deliveries) {
      const schema = schemas[delivery.event as keyof typeof schemas];
      if (schema) {
        expect(
          schema.safeParse(delivery.payload),
          `${delivery.event}: ${JSON.stringify(delivery.payload)}`,
        ).toMatchObject({ success: true });
      }
    }

    await engine.stop();
  });

  it("pauses a disconnected drawer, resumes with credentials, and transfers host after grace", async () => {
    const { engine } = await createFixture();
    const { code, hostSession } = await createTwoPlayerGame(engine);
    await engine.startMatch("socket-host", "start-match-0001");

    await engine.disconnect("socket-host");
    expect(engine.inspectRoom(code)?.round?.pausedUntil).not.toBeNull();
    expect(engine.inspectRoom(code)?.players.find((player) => player.name === "Maya")?.isHost)
      .toBe(true);

    const recovered = await engine.connect("socket-host-new", hostSession.reconnectToken);
    expect(recovered.recovered).toBe(true);
    expect(engine.inspectRoom(code)?.round?.pausedUntil).toBeNull();

    await engine.disconnect("socket-host-new");
    expect(engine.inspectRoom(code)?.phase).toBe("turn-results");
    await vi.advanceTimersByTimeAsync(30_001);
    const room = engine.inspectRoom(code)!;
    expect(room.players.map((player) => player.name)).toEqual(["Noah"]);
    expect(room.players[0]?.isHost).toBe(true);

    await engine.stop();
  });

  it("rehydrates a persisted active room and allows token recovery", async () => {
    const first = await createFixture();
    const { code, guestSession } = await createTwoPlayerGame(first.engine);
    await first.engine.startMatch("socket-host", "start-match-0001");
    await first.engine.stop();

    let id = 100;
    const recoveredEngine = new GameEngine({
      persistence: first.persistence,
      transport: new CapturingTransport(),
      rules: makeRules(),
      config: {
        sessionSecret: "test-session-secret-that-is-long-enough",
        roomLifetimeMs: 8 * 60 * 60 * 1_000,
        emptyRoomTtlMs: 30 * 60 * 1_000,
        disconnectedSeatMs: 30_000,
        drawerPauseMs: 20_000,
      },
      now: () => Date.now(),
      id: () => `restored-${++id}`,
      random: () => 0,
    });
    await recoveredEngine.start();
    expect(recoveredEngine.inspectRoom(code)?.round?.pausedUntil).not.toBeNull();

    const recovered = await recoveredEngine.connect(
      "socket-guest-restored",
      guestSession.reconnectToken,
    );
    expect(recovered).toMatchObject({
      recovered: true,
      roomCode: code,
    });
    expect(recovered.snapshot?.privateRound).toBeNull();

    await recoveredEngine.stop();
  });

  it("reports an offline kick after rehydration instead of silently losing the seat", async () => {
    const first = await createFixture();
    const { code, hostSession, guestSession } =
      await createTwoPlayerGame(first.engine);
    const guestId = first.engine
      .inspectRoom(code)!
      .players.find((player) => player.name === "Noah")!.id;
    await first.engine.disconnect("socket-guest");
    await first.engine.stop();

    let id = 200;
    const recoveredEngine = new GameEngine({
      persistence: first.persistence,
      transport: new CapturingTransport(),
      rules: makeRules(),
      config: {
        sessionSecret: "test-session-secret-that-is-long-enough",
        roomLifetimeMs: 8 * 60 * 60 * 1_000,
        emptyRoomTtlMs: 30 * 60 * 1_000,
        disconnectedSeatMs: 30_000,
        drawerPauseMs: 20_000,
      },
      now: () => Date.now(),
      id: () => `restored-${++id}`,
      random: () => 0,
    });
    await recoveredEngine.start();
    await recoveredEngine.connect(
      "socket-host-restored",
      hostSession.reconnectToken,
    );
    await recoveredEngine.kickPlayer(
      "socket-host-restored",
      "kick-offline-0001",
      guestId,
    );
    await recoveredEngine.connect("socket-guest-fresh");

    await expect(
      recoveredEngine.resumeSession(
        "socket-guest-fresh",
        code,
        guestId,
        guestSession.reconnectToken,
      ),
    ).rejects.toMatchObject({ code: "KICKED" });
    await expect(
      recoveredEngine.snapshotForSocket("socket-guest-fresh"),
    ).rejects.toMatchObject({ code: "NOT_IN_ROOM" });

    await recoveredEngine.stop();
  });

  it("preserves a disconnected player's kick reason until their next resume", async () => {
    const { engine } = await createFixture();
    const { code, guestSession } = await createTwoPlayerGame(engine);
    const guestId = engine
      .inspectRoom(code)!
      .players.find((player) => player.name === "Noah")!.id;
    await engine.disconnect("socket-guest");
    await engine.kickPlayer(
      "socket-host",
      "kick-disconnected1",
      guestId,
    );
    await engine.connect("socket-guest-fresh");

    await expect(
      engine.resumeSession(
        "socket-guest-fresh",
        code,
        guestId,
        guestSession.reconnectToken,
      ),
    ).rejects.toMatchObject({ code: "KICKED" });

    await engine.stop();
  });

  it("restores an in-progress drawer pause and expires it at its original deadline", async () => {
    const first = await createFixture();
    const { code } = await createTwoPlayerGame(first.engine);
    await first.engine.startMatch("socket-host", "start-match-0001");
    await first.engine.disconnect("socket-host");
    const originalPausedUntil = first.engine.inspectRoom(code)!.round!.pausedUntil;
    expect(originalPausedUntil).not.toBeNull();
    await first.engine.stop();

    const recoveredEngine = new GameEngine({
      persistence: first.persistence,
      transport: new CapturingTransport(),
      rules: makeRules(),
      config: {
        sessionSecret: "test-session-secret-that-is-long-enough",
        roomLifetimeMs: 8 * 60 * 60 * 1_000,
        emptyRoomTtlMs: 30 * 60 * 1_000,
        disconnectedSeatMs: 30_000,
        drawerPauseMs: 20_000,
      },
      now: () => Date.now(),
      id: () => "restored-id",
      random: () => 0,
    });
    await recoveredEngine.start();
    expect(recoveredEngine.inspectRoom(code)?.round?.pausedUntil).toBe(
      originalPausedUntil,
    );

    await vi.advanceTimersByTimeAsync(20_001);
    expect(recoveredEngine.inspectRoom(code)?.phase).toBe("turn-results");
    expect(recoveredEngine.inspectRoom(code)?.round?.pausedUntil).toBeNull();

    await recoveredEngine.stop();
  });
});
