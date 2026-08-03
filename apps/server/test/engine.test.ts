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
  type ClassicRoomSettings,
  type PhoneRoomSettings,
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

const testSettings: ClassicRoomSettings = {
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

const phoneSettings: PhoneRoomSettings = {
  mode: "phone",
  maxPlayers: 12,
  textSeconds: 30,
  drawingSeconds: 60,
};

async function createPhoneGame(engine: GameEngine, playerCount = 4) {
  const sockets = Array.from(
    { length: playerCount },
    (_, index) => `phone-socket-${index}`,
  );
  const sessions = [];
  for (const socketId of sockets) {
    sessions.push(await engine.connect(socketId));
  }
  const created = await engine.createRoom(sockets[0]!, {
    idempotencyId: "phone-create-0001",
    name: "Phone Host",
    avatar: DEFAULT_AVATAR,
    settings: phoneSettings,
  });
  const playerIds = [created.data.credentials.playerId];
  for (let index = 1; index < sockets.length; index += 1) {
    const joined = await engine.joinRoom(sockets[index]!, {
      idempotencyId: `phone-join-${index.toString().padStart(4, "0")}`,
      roomCode: created.data.snapshot.code,
      name: `Player ${index}`,
      avatar: {
        ...DEFAULT_AVATAR,
        backgroundColor: `#00000${index}`,
      },
    });
    playerIds.push(joined.data.credentials.playerId);
  }
  return {
    code: created.data.snapshot.code,
    sockets,
    playerIds,
    sessions,
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
    expect(
      ("privateRound" in hostSnapshot ? hostSnapshot.privateRound : null)
        ?.wordChoices,
    ).toEqual([
      "Elephant",
      "Bicycle",
      "Rainbow",
    ]);
    expect(
      "privateRound" in guestSnapshot ? guestSnapshot.privateRound : null,
    ).toBeNull();
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
    const activeHostSnapshot =
      await engine.snapshotForSocket("socket-host");
    expect(
      ("privateRound" in activeHostSnapshot
        ? activeHostSnapshot.privateRound
        : null)?.answer,
    ).toBe("Elephant");

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
    const updatedSettings = engine.inspectRoom(code)?.settings;
    expect(
      updatedSettings?.mode === "phone"
        ? undefined
        : updatedSettings?.turnSeconds,
    ).toBe(90);
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
      scoreDelta: 1_000,
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

  it("hands the next drawer word choices immediately after a turn ends", async () => {
    const { engine, transport } = await createFixture();
    const { code } = await createTwoPlayerGame(engine);
    await engine.startMatch("socket-host", "start-match-0001");
    const firstTurnId = engine.inspectRoom(code)!.round!.turnId;
    await engine.selectWord(
      "socket-host",
      "select-word-0001",
      firstTurnId,
      0,
    );

    transport.deliveries.length = 0;
    await engine.submitGuess(
      "socket-guest",
      "guess-right-0001",
      firstTurnId,
      "elephant",
    );
    await vi.advanceTimersByTimeAsync(0);

    const room = engine.inspectRoom(code)!;
    expect(room.phase).toBe("selecting");
    expect(room.round?.turnId).not.toBe(firstTurnId);
    expect(
      room.players.find((player) => player.id === room.round?.drawerId)?.name,
    ).toBe("Noah");

    const endedEventIndex = transport.deliveries.findIndex(
      (delivery) => delivery.event === "round:ended",
    );
    const selectionEventIndex = transport.deliveries.findIndex(
      (delivery) => delivery.event === "round:selection-started",
    );
    const privateSelection = transport.deliveries.find(
      (delivery) =>
        delivery.event === "round:private" &&
        delivery.target.kind === "socket" &&
        delivery.target.socketId === "socket-guest",
    );
    expect(endedEventIndex).toBeGreaterThanOrEqual(0);
    expect(selectionEventIndex).toBeGreaterThan(endedEventIndex);
    expect(privateSelection?.payload).toMatchObject({
      privateRound: {
        turnId: room.round?.turnId,
        answer: null,
      },
    });
    expect(
      (
        privateSelection?.payload as {
          privateRound?: { wordChoices?: unknown[] };
        }
      ).privateRound?.wordChoices,
    ).toHaveLength(3);
    await expect(
      engine.selectWord(
        "socket-host",
        "stale-select-word1",
        firstTurnId,
        0,
      ),
    ).rejects.toMatchObject({ code: "STALE_TURN" });

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
    expect(first.data.feedback.scoreDelta).toBe(1_000);
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
      scoreDelta: 900,
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
    expect(engine.inspectRoom(code)?.phase).toBe("selecting");
    expect(drawer?.score).toBe(75);

    await engine.stop();
  });

  it("rejects new players after a match has started", async () => {
    const { engine } = await createFixture();
    const { code } = await createTwoPlayerGame(engine);
    await engine.startMatch("socket-host", "start-match-0001");
    const turnId = engine.inspectRoom(code)!.round!.turnId;
    await engine.selectWord("socket-host", "select-word-0001", turnId, 0);

    await engine.connect("socket-late");
    await expect(
      engine.joinRoom("socket-late", {
        idempotencyId: "join-room-late001",
        roomCode: code,
        name: "Lena",
        avatar: { ...DEFAULT_AVATAR, hairStyle: "curls" },
      }),
    ).rejects.toMatchObject({ code: "ROOM_STARTED" });
    expect(engine.inspectRoom(code)?.round?.turnId).toBe(turnId);

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
    expect(
      recovered.snapshot && "privateRound" in recovered.snapshot
        ? recovered.snapshot.privateRound
        : null,
    ).toBeNull();

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
    expect(recoveredEngine.inspectRoom(code)?.phase).toBe("final-results");
    expect(recoveredEngine.inspectRoom(code)?.round).toBeNull();

    await recoveredEngine.stop();
  });

  it("applies Pro penalties once, floors scores at zero, and keeps a signed ledger", async () => {
    const { engine, transport } = await createFixture();
    const { code } = await createTwoPlayerGame(engine);
    await engine.updateSettings(
      "socket-host",
      "pro-settings-0001",
      { ...testSettings, mode: "pro" },
      undefined,
      engine.inspectRoom(code)!.revision,
    );
    await engine.startMatch("socket-host", "pro-start-000001");
    const turnId = engine.inspectRoom(code)!.round!.turnId;
    await engine.selectWord(
      "socket-host",
      "pro-word-0000001",
      turnId,
      0,
    );
    const guest = engine
      .inspectRoom(code)!
      .players.find((player) => player.name === "Noah")!;
    guest.score = 30;

    const first = await engine.submitGuess(
      "socket-guest",
      "pro-wrong-000001",
      turnId,
      "giraffe",
    );
    expect(first.data.feedback.scoreDelta).toBe(-25);
    expect(guest.score).toBe(5);

    const duplicate = await engine.submitGuess(
      "socket-guest",
      "pro-wrong-000001",
      turnId,
      "giraffe",
    );
    expect(duplicate).toEqual(first);
    expect(guest.score).toBe(5);

    const close = await engine.submitGuess(
      "socket-guest",
      "pro-close-000001",
      turnId,
      "elephnt",
    );
    expect(close.data.feedback).toMatchObject({
      kind: "close",
      scoreDelta: 0,
    });
    expect(guest.score).toBe(5);

    const floor = await engine.submitGuess(
      "socket-guest",
      "pro-wrong-000002",
      turnId,
      "zebra",
    );
    expect(floor.data.feedback.scoreDelta).toBe(-5);
    expect(guest.score).toBe(0);

    const atFloor = await engine.submitGuess(
      "socket-guest",
      "pro-wrong-000003",
      turnId,
      "kangaroo",
    );
    expect(atFloor.data.feedback).toMatchObject({
      kind: "incorrect",
      scoreDelta: 0,
    });
    expect(guest.score).toBe(0);
    expect(engine.inspectRoom(code)!.round!.scoreChanges).toEqual([
      {
        playerId: guest.id,
        delta: -25,
        total: 5,
        reason: "incorrect-guess",
      },
      {
        playerId: guest.id,
        delta: -5,
        total: 0,
        reason: "incorrect-guess",
      },
      {
        playerId: guest.id,
        delta: 0,
        total: 0,
        reason: "incorrect-guess",
      },
    ]);
    expect(engine.inspectRoom(code)!.chat.at(-1)?.text).toBe("kangaroo");
    expect(
      transport.deliveries.filter(
        (delivery) => delivery.event === "score:updated",
      ),
    ).toHaveLength(3);
    expect(
      transport.deliveries
        .filter(
          (delivery) =>
            delivery.event === "guess:feedback" &&
            delivery.target.kind === "socket" &&
            delivery.target.socketId === "socket-guest",
        )
        .at(-1)?.payload,
    ).toMatchObject({
      feedbackId: "pro-wrong-000003",
      feedback: { kind: "incorrect", scoreDelta: 0 },
    });
    await engine.stop();
  });

  it("keeps Classic incorrect guesses score-neutral without score events", async () => {
    const { engine, transport } = await createFixture();
    const { code } = await createTwoPlayerGame(engine);
    await engine.startMatch("socket-host", "classic-wrong-start");
    const turnId = engine.inspectRoom(code)!.round!.turnId;
    await engine.selectWord(
      "socket-host",
      "classic-wrong-word",
      turnId,
      0,
    );
    const guest = engine
      .inspectRoom(code)!
      .players.find((player) => player.name === "Noah")!;
    guest.score = 30;
    transport.deliveries.length = 0;

    const result = await engine.submitGuess(
      "socket-guest",
      "classic-wrong-guess",
      turnId,
      "kangaroo",
    );

    expect(result.data.feedback).toMatchObject({
      kind: "incorrect",
      scoreDelta: 0,
    });
    expect(guest.score).toBe(30);
    expect(engine.inspectRoom(code)!.round!.scoreChanges).toEqual([]);
    expect(engine.inspectRoom(code)!.chat.at(-1)?.text).toBe("kangaroo");
    expect(
      transport.deliveries.some(
        (delivery) => delivery.event === "score:updated",
      ),
    ).toBe(false);
    await engine.stop();
  });

  it("persists the initial Phone state before publishing and replays a concurrent start", async () => {
    const persistence = new GatePersistence(() => Date.now());
    const { engine, transport } = await createFixture(persistence);
    const { code, sockets } = await createPhoneGame(engine);
    transport.deliveries.length = 0;
    const saveBlocked = persistence.blockNextSave();

    const starts = Promise.all([
      engine.startMatch(sockets[0]!, "phone-concurrent-start"),
      engine.startMatch(sockets[0]!, "phone-concurrent-start"),
    ]);
    await saveBlocked;

    expect(engine.inspectRoom(code)?.phase).toBe("phone-writing");
    expect(transport.deliveries).toEqual([]);
    persistence.releaseSave();
    const [first, duplicate] = await starts;

    expect(duplicate).toEqual(first);
    expect(
      transport.deliveries.filter(
        (delivery) => delivery.event === "phone:state",
      ),
    ).toHaveLength(1);
    expect(
      engine
        .inspectRoom(code)!
        .phoneMatch!.storylines.every(
          (storyline) => storyline.entries.length === 1,
        ),
    ).toBe(true);
    await engine.stop();
  });

  it("replays concurrent final Phone submissions without double-advancing phases", async () => {
    const { engine } = await createFixture();
    const { code, sockets } = await createPhoneGame(engine);
    await engine.startMatch(sockets[0]!, "phone-idempotent-start");

    const writingSnapshots = await Promise.all(
      sockets.map((socketId) => engine.snapshotForSocket(socketId)),
    );
    for (let index = 0; index < sockets.length - 1; index += 1) {
      const snapshot = writingSnapshots[index]!;
      if (snapshot.mode !== "phone" || !snapshot.privatePhone) {
        throw new Error("Expected a Phone writing assignment.");
      }
      await engine.submitPhoneText(
        sockets[index]!,
        `phone-idempotent-text-${index}`,
        snapshot.privatePhone.assignmentId,
        `Opening ${index}`,
      );
    }
    const lastWriting = writingSnapshots.at(-1)!;
    if (
      lastWriting.mode !== "phone" ||
      !lastWriting.privatePhone
    ) {
      throw new Error("Expected the final Phone writing assignment.");
    }
    const textSubmissions = await Promise.all([
      engine.submitPhoneText(
        sockets.at(-1)!,
        "phone-idempotent-final-text",
        lastWriting.privatePhone.assignmentId,
        "Final opening",
      ),
      engine.submitPhoneText(
        sockets.at(-1)!,
        "phone-idempotent-final-text",
        lastWriting.privatePhone.assignmentId,
        "Final opening",
      ),
    ]);
    expect(textSubmissions[1]).toEqual(textSubmissions[0]);
    expect(engine.inspectRoom(code)).toMatchObject({
      phase: "phone-drawing-1",
      phoneMatch: { phaseIndex: 1 },
    });
    expect(
      engine
        .inspectRoom(code)!
        .phoneMatch!.storylines.every(
          (storyline) => storyline.entries.length === 2,
        ),
    ).toBe(true);

    const drawingSnapshots = await Promise.all(
      sockets.map((socketId) => engine.snapshotForSocket(socketId)),
    );
    for (let index = 0; index < sockets.length; index += 1) {
      const snapshot = drawingSnapshots[index]!;
      if (snapshot.mode !== "phone" || !snapshot.privatePhone) {
        throw new Error("Expected a Phone drawing assignment.");
      }
      const assignmentId = snapshot.privatePhone.assignmentId;
      await engine.submitPhoneDrawingBatch(sockets[index]!, {
        idempotencyId: `phone-idempotent-batch-${index}`,
        assignmentId,
        strokeId: `phone-idempotent-stroke-${index}`,
        chunkId: 0,
        operations: [{
          opId: `phone-idempotent-stroke-${index}`,
          kind: "stroke",
          tool: "brush",
          style: { color: "#123456", size: 8, fill: false },
          points: [{ x: 20 + index, y: 30 + index }],
        }],
      });
      if (index < sockets.length - 1) {
        await engine.submitPhoneDrawing(
          sockets[index]!,
          `phone-idempotent-drawing-${index}`,
          assignmentId,
        );
      }
    }
    const finalDrawing = drawingSnapshots.at(-1)!;
    if (
      finalDrawing.mode !== "phone" ||
      !finalDrawing.privatePhone
    ) {
      throw new Error("Expected the final Phone drawing assignment.");
    }
    const drawingSubmissions = await Promise.all([
      engine.submitPhoneDrawing(
        sockets.at(-1)!,
        "phone-idempotent-final-drawing",
        finalDrawing.privatePhone.assignmentId,
      ),
      engine.submitPhoneDrawing(
        sockets.at(-1)!,
        "phone-idempotent-final-drawing",
        finalDrawing.privatePhone.assignmentId,
      ),
    ]);
    expect(drawingSubmissions[1]).toEqual(drawingSubmissions[0]);
    expect(engine.inspectRoom(code)).toMatchObject({
      phase: "phone-guessing",
      phoneMatch: { phaseIndex: 2 },
    });
    expect(
      engine
        .inspectRoom(code)!
        .phoneMatch!.storylines.every(
          (storyline) => storyline.entries.length === 3,
        ),
    ).toBe(true);
    await engine.stop();
  });

  it("runs a private four-phase Phone match and reveals only the synchronized prefix", async () => {
    const { engine, transport } = await createFixture();
    const { code, sockets, playerIds } = await createPhoneGame(engine);
    await engine.startMatch(sockets[0]!, "phone-start-0001");
    expect(engine.inspectRoom(code)?.phase).toBe("phone-writing");

    const originalTexts = new Map<string, string>();
    for (let index = 0; index < sockets.length; index += 1) {
      const snapshot = await engine.snapshotForSocket(sockets[index]!);
      expect(PlayerRoomSnapshotSchema.safeParse(snapshot).success).toBe(
        true,
      );
      expect(snapshot.mode).toBe("phone");
      if (snapshot.mode !== "phone" || !snapshot.privatePhone) {
        throw new Error("Expected a private Phone writing assignment.");
      }
      expect(snapshot.privatePhone.prompt).toBeNull();
      const text = `Opening sentence ${index}`;
      originalTexts.set(playerIds[index]!, text);
      await engine.submitPhoneText(
        sockets[index]!,
        `phone-text-${index.toString().padStart(4, "0")}`,
        snapshot.privatePhone.assignmentId,
        text,
      );
    }
    expect(engine.inspectRoom(code)?.phase).toBe("phone-drawing-1");

    const receivedTexts = new Set<string>();
    for (let index = 0; index < sockets.length; index += 1) {
      const snapshot = await engine.snapshotForSocket(sockets[index]!);
      if (
        snapshot.mode !== "phone" ||
        snapshot.privatePhone?.prompt?.kind !== "text"
      ) {
        throw new Error("Expected a private Phone text prompt.");
      }
      expect(snapshot.privatePhone.prompt.text).not.toBe(
        originalTexts.get(playerIds[index]!),
      );
      receivedTexts.add(snapshot.privatePhone.prompt.text);
      const assignmentId = snapshot.privatePhone.assignmentId;
      const opId = `phone-draw-one-${index}`;
      const revisionBeforeBatch = snapshot.revision;
      const batch = await engine.submitPhoneDrawingBatch(sockets[index]!, {
        idempotencyId: `phone-batch-one-${index}`,
        assignmentId,
        strokeId: opId,
        chunkId: 0,
        operations: [{
          opId,
          kind: "stroke",
          tool: "brush",
          style: { color: "#123456", size: 10, fill: false },
          points: [{ x: 10 + index, y: 20 + index }],
        }],
      });
      expect(batch.revision).toBe(revisionBeforeBatch);
      await engine.submitPhoneDrawing(
        sockets[index]!,
        `phone-draw-submit-one-${index}`,
        assignmentId,
      );
    }
    expect(receivedTexts.size).toBe(4);
    expect(
      transport.deliveries.some(
        (delivery) => delivery.event === "drawing:batch",
      ),
    ).toBe(false);
    expect(engine.inspectRoom(code)?.phase).toBe("phone-guessing");

    const receivedDrawingMarkers = new Set<string>();
    for (let index = 0; index < sockets.length; index += 1) {
      const snapshot = await engine.snapshotForSocket(sockets[index]!);
      if (
        snapshot.mode !== "phone" ||
        snapshot.privatePhone?.prompt?.kind !== "drawing"
      ) {
        throw new Error("Expected a private Phone drawing prompt.");
      }
      const marker =
        snapshot.privatePhone.prompt.envelopes[0]?.operation.opId;
      expect(marker).toBeTruthy();
      expect(marker).not.toBe(`phone-draw-one-${index}`);
      receivedDrawingMarkers.add(marker!);
      await engine.submitPhoneText(
        sockets[index]!,
        `phone-guess-${index.toString().padStart(4, "0")}`,
        snapshot.privatePhone.assignmentId,
        `Guess sentence ${index}`,
      );
    }
    expect(receivedDrawingMarkers.size).toBe(4);
    expect(engine.inspectRoom(code)?.phase).toBe("phone-drawing-2");

    for (let index = 0; index < sockets.length; index += 1) {
      const snapshot = await engine.snapshotForSocket(sockets[index]!);
      if (
        snapshot.mode !== "phone" ||
        snapshot.privatePhone?.prompt?.kind !== "text"
      ) {
        throw new Error("Expected a private Phone guess prompt.");
      }
      expect(snapshot.privatePhone.prompt.text).not.toBe(
        `Guess sentence ${index}`,
      );
      const assignmentId = snapshot.privatePhone.assignmentId;
      const opId = `phone-draw-two-${index}`;
      await engine.submitPhoneDrawingBatch(sockets[index]!, {
        idempotencyId: `phone-batch-two-${index}`,
        assignmentId,
        strokeId: opId,
        chunkId: 0,
        operations: [{
          opId,
          kind: "shape",
          shape: "rectangle",
          style: { color: "#654321", size: 8, fill: false },
          start: { x: 30, y: 40 },
          end: { x: 60, y: 80 },
        }],
      });
      await engine.submitPhoneDrawing(
        sockets[index]!,
        `phone-draw-submit-two-${index}`,
        assignmentId,
      );
    }
    expect(engine.inspectRoom(code)?.phase).toBe("phone-summary");
    const initialSummary = await engine.snapshotForSocket(sockets[1]!);
    expect(
      PlayerRoomSnapshotSchema.safeParse(initialSummary).success,
    ).toBe(true);
    if (
      initialSummary.mode !== "phone" ||
      initialSummary.phone?.phase !== "phone-summary"
    ) {
      throw new Error("Expected the Phone summary.");
    }
    expect(initialSummary.phone.cursor).toEqual({
      storyIndex: 0,
      entryIndex: 0,
    });
    expect(initialSummary.phone.storyline.entries).toHaveLength(1);
    await expect(
      engine.navigatePhoneSummary(
        sockets[1]!,
        "phone-summary-guest",
        "next",
      ),
    ).rejects.toMatchObject({ code: "NOT_HOST" });

    for (let index = 0; index < 15; index += 1) {
      await engine.navigatePhoneSummary(
        sockets[0]!,
        `phone-summary-next-${index}`,
        "next",
      );
    }
    const fullyRevealed = await engine.snapshotForSocket(sockets[2]!);
    if (
      fullyRevealed.mode !== "phone" ||
      fullyRevealed.phone?.phase !== "phone-summary"
    ) {
      throw new Error("Expected a revealed Phone summary.");
    }
    expect(fullyRevealed.phone.cursor).toEqual({
      storyIndex: 3,
      entryIndex: 3,
    });
    expect(fullyRevealed.phone.storyline.entries).toHaveLength(4);
    expect(
      fullyRevealed.phone.storyline.entries.every(
        (entry) => entry.author.playerName.length > 0,
      ),
    ).toBe(true);

    await engine.navigatePhoneSummary(
      sockets[0]!,
      "phone-summary-finish",
      "finish",
    );
    const complete = await engine.snapshotForSocket(sockets[3]!);
    expect(PlayerRoomSnapshotSchema.safeParse(complete).success).toBe(
      true,
    );
    expect(complete).toMatchObject({
      mode: "phone",
      phase: "final-results",
      phone: { phase: "final-results", storyCount: 4 },
    });
    const completedMatchId =
      complete.mode === "phone" ? complete.phone?.matchId : null;
    await engine.startMatch(sockets[0]!, "phone-rematch-start");
    const rematch = await engine.snapshotForSocket(sockets[0]!);
    expect(rematch).toMatchObject({
      mode: "phone",
      phase: "phone-writing",
    });
    expect(
      rematch.mode === "phone" ? rematch.phone?.matchId : null,
    ).not.toBe(completedMatchId);
    await engine.stop();
  });

  it("uses fair Phone offsets for 4-12 players and skips unresolved work at the deadline", async () => {
    const threePlayerFixture = await createFixture();
    const threePlayerGame = await createPhoneGame(
      threePlayerFixture.engine,
      3,
    );
    await expect(
      threePlayerFixture.engine.startMatch(
        threePlayerGame.sockets[0]!,
        "phone-start-three",
      ),
    ).rejects.toMatchObject({ code: "INVALID_PHASE" });
    await threePlayerFixture.engine.stop();

    for (let playerCount = 4; playerCount <= 12; playerCount += 1) {
      const { engine } = await createFixture();
      const { code, sockets } = await createPhoneGame(
        engine,
        playerCount,
      );
      await engine.startMatch(
        sockets[0]!,
        `phone-start-${playerCount.toString().padStart(4, "0")}`,
      );
      const match = engine.inspectRoom(code)!.phoneMatch!;
      expect(new Set(match.assignmentOffsets).size).toBe(3);
      expect(
        match.assignmentOffsets.every(
          (offset) => offset > 0 && offset < playerCount,
        ),
      ).toBe(true);
      if (playerCount === 4) {
        const hostSnapshot = await engine.snapshotForSocket(sockets[0]!);
        if (hostSnapshot.mode !== "phone" || !hostSnapshot.privatePhone) {
          throw new Error("Expected a Phone assignment.");
        }
        await engine.submitPhoneText(
          sockets[0]!,
          "phone-only-host-text",
          hostSnapshot.privatePhone.assignmentId,
          "Only the host submitted",
        );
        await vi.advanceTimersByTimeAsync(30_001);
        expect(engine.inspectRoom(code)?.phase).toBe("phone-drawing-1");
        const firstEntries = match.storylines.map(
          (storyline) => storyline.entries[0],
        );
        expect(
          firstEntries.filter((entry) => entry?.status === "submitted"),
        ).toHaveLength(1);
        expect(
          firstEntries.filter(
            (entry) =>
              entry?.status === "skipped" &&
              entry.skippedReason === "timeout",
          ),
        ).toHaveLength(3);
      }
      await engine.stop();
    }
  });

  it("keeps removed Phone identities and rejects empty, eraser-only, clear-only, and erased drawings", async () => {
    const { engine } = await createFixture();
    const { code, sockets, playerIds } = await createPhoneGame(engine);
    await engine.startMatch(sockets[0]!, "phone-remove-start");
    await engine.leaveRoom(
      sockets[3]!,
      "phone-player-leave",
    );

    const publicAfterLeave =
      await engine.snapshotForSocket(sockets[0]!);
    if (
      publicAfterLeave.mode !== "phone" ||
      publicAfterLeave.phone?.phase !== "phone-writing"
    ) {
      throw new Error("Expected active Phone state.");
    }
    expect(
      publicAfterLeave.phone.participants.find(
        (participant) => participant.playerId === playerIds[3],
      ),
    ).toMatchObject({
      playerName: "Player 3",
      status: "skipped",
    });

    for (let index = 0; index < 3; index += 1) {
      const snapshot = await engine.snapshotForSocket(sockets[index]!);
      if (snapshot.mode !== "phone" || !snapshot.privatePhone) {
        throw new Error("Expected a Phone writing assignment.");
      }
      await engine.submitPhoneText(
        sockets[index]!,
        `phone-after-leave-${index}`,
        snapshot.privatePhone.assignmentId,
        `Remaining sentence ${index}`,
      );
    }
    expect(engine.inspectRoom(code)?.phase).toBe("phone-drawing-1");
    expect(
      engine
        .inspectRoom(code)!
        .phoneMatch!.storylines.flatMap((storyline) => storyline.entries)
        .some(
          (entry) =>
            entry.contributorPlayerId === playerIds[3] &&
            entry.status === "skipped" &&
            entry.skippedReason === "left",
        ),
    ).toBe(true);

    const drawingSnapshot =
      await engine.snapshotForSocket(sockets[0]!);
    if (drawingSnapshot.mode !== "phone" || !drawingSnapshot.privatePhone) {
      throw new Error("Expected a Phone drawing assignment.");
    }
    const assignmentId = drawingSnapshot.privatePhone.assignmentId;
    await expect(
      engine.submitPhoneDrawing(
        sockets[0]!,
        "phone-empty-submit",
        assignmentId,
      ),
    ).rejects.toMatchObject({ code: "INVALID_PAYLOAD" });
    await engine.submitPhoneDrawingBatch(sockets[0]!, {
      idempotencyId: "phone-eraser-batch",
      assignmentId,
      strokeId: "phone-eraser-op",
      chunkId: 0,
      operations: [{
        opId: "phone-eraser-op",
        kind: "stroke",
        tool: "eraser",
        style: { color: "#123456", size: 8, fill: false },
        points: [{ x: 20, y: 30 }],
      }],
    });
    await expect(
      engine.submitPhoneDrawing(
        sockets[0]!,
        "phone-eraser-submit",
        assignmentId,
      ),
    ).rejects.toMatchObject({ code: "INVALID_PAYLOAD" });

    const clearOnlySnapshot =
      await engine.snapshotForSocket(sockets[1]!);
    if (
      clearOnlySnapshot.mode !== "phone" ||
      !clearOnlySnapshot.privatePhone
    ) {
      throw new Error("Expected another Phone drawing assignment.");
    }
    const clearOnlyAssignmentId =
      clearOnlySnapshot.privatePhone.assignmentId;
    await engine.submitPhoneDrawingBatch(sockets[1]!, {
      idempotencyId: "phone-clear-only-batch",
      assignmentId: clearOnlyAssignmentId,
      strokeId: "phone-clear-only-op",
      chunkId: 0,
      operations: [{
        opId: "phone-clear-only-op",
        kind: "clear",
      }],
    });
    await expect(
      engine.submitPhoneDrawing(
        sockets[1]!,
        "phone-clear-only-submit",
        clearOnlyAssignmentId,
      ),
    ).rejects.toMatchObject({ code: "INVALID_PAYLOAD" });

    await engine.submitPhoneDrawingBatch(sockets[0]!, {
      idempotencyId: "phone-visible-batch",
      assignmentId,
      strokeId: "phone-visible-op",
      chunkId: 0,
      operations: [{
        opId: "phone-visible-op",
        kind: "stroke",
        tool: "brush",
        style: { color: "#123456", size: 8, fill: false },
        points: [{ x: 20, y: 30 }],
      }],
    });
    await engine.submitPhoneDrawingBatch(sockets[0]!, {
      idempotencyId: "phone-clear-batch",
      assignmentId,
      strokeId: "phone-clear-op",
      chunkId: 0,
      operations: [{
        opId: "phone-clear-op",
        kind: "clear",
      }],
    });
    await expect(
      engine.submitPhoneDrawing(
        sockets[0]!,
        "phone-cleared-submit",
        assignmentId,
      ),
    ).rejects.toMatchObject({ code: "INVALID_PAYLOAD" });
    await engine.stop();
  });

  it("restores a temporary Phone disconnect without extending the deadline and skips kicked or expired seats", async () => {
    const { engine } = await createFixture();
    const { code, sockets, playerIds, sessions } =
      await createPhoneGame(engine);
    await engine.updateSettings(
      sockets[0]!,
      "phone-reconnect-settings",
      { ...phoneSettings, textSeconds: 120 },
      undefined,
      engine.inspectRoom(code)!.revision,
    );
    await engine.startMatch(sockets[0]!, "phone-reconnect-start");

    const beforeDisconnect =
      await engine.snapshotForSocket(sockets[1]!);
    if (
      beforeDisconnect.mode !== "phone" ||
      !beforeDisconnect.privatePhone ||
      beforeDisconnect.phone?.phase !== "phone-writing"
    ) {
      throw new Error("Expected an active Phone writing assignment.");
    }
    const assignmentId = beforeDisconnect.privatePhone.assignmentId;
    const originalDeadline = beforeDisconnect.phone.deadline;

    await engine.disconnect(sockets[1]!);
    const disconnected =
      await engine.snapshotForSocket(sockets[0]!);
    if (
      disconnected.mode !== "phone" ||
      disconnected.phone?.phase !== "phone-writing"
    ) {
      throw new Error("Expected active Phone state after disconnect.");
    }
    expect(
      disconnected.phone.participants.find(
        ({ playerId }) => playerId === playerIds[1],
      )?.status,
    ).toBe("disconnected");

    await vi.advanceTimersByTimeAsync(5_000);
    const reconnectedSocket = "phone-socket-1-reconnected";
    const recovered = await engine.connect(
      reconnectedSocket,
      sessions[1]!.reconnectToken,
    );
    if (
      recovered.snapshot?.mode !== "phone" ||
      !recovered.snapshot.privatePhone ||
      recovered.snapshot.phone?.phase !== "phone-writing"
    ) {
      throw new Error("Expected the Phone assignment to recover.");
    }
    expect(recovered.snapshot.privatePhone.assignmentId).toBe(
      assignmentId,
    );
    expect(recovered.snapshot.phone.deadline).toBe(originalDeadline);

    await engine.kickPlayer(
      sockets[0]!,
      "phone-kick-active-seat",
      playerIds[2]!,
    );
    await engine.disconnect(sockets[3]!);
    await vi.advanceTimersByTimeAsync(30_001);

    const roomAfterRemoval = engine.inspectRoom(code)!;
    expect(roomAfterRemoval.phase).toBe("phone-writing");
    const writingEntries = roomAfterRemoval.phoneMatch!.storylines.map(
      (storyline) => storyline.entries[0],
    );
    expect(
      writingEntries.find(
        (entry) => entry?.contributorPlayerId === playerIds[2],
      ),
    ).toMatchObject({
      status: "skipped",
      skippedReason: "kicked",
    });
    expect(
      writingEntries.find(
        (entry) => entry?.contributorPlayerId === playerIds[3],
      ),
    ).toMatchObject({
      status: "skipped",
      skippedReason: "disconnected",
    });

    for (const socketId of [sockets[0]!, reconnectedSocket]) {
      const snapshot = await engine.snapshotForSocket(socketId);
      if (snapshot.mode !== "phone" || !snapshot.privatePhone) {
        throw new Error("Expected a remaining Phone assignment.");
      }
      await engine.submitPhoneText(
        socketId,
        `phone-after-removal-${socketId}`,
        snapshot.privatePhone.assignmentId,
        `Still active ${socketId}`,
      );
    }
    expect(engine.inspectRoom(code)).toMatchObject({
      phase: "phone-drawing-1",
      phoneMatch: { phaseIndex: 1 },
    });
    await engine.stop();
  });

  it("restores the original Phone deadline and private drawing draft after restart", async () => {
    const first = await createFixture();
    const { code, sockets, sessions } = await createPhoneGame(
      first.engine,
    );
    await first.engine.startMatch(sockets[0]!, "phone-restore-start");
    for (let index = 0; index < sockets.length; index += 1) {
      const snapshot =
        await first.engine.snapshotForSocket(sockets[index]!);
      if (snapshot.mode !== "phone" || !snapshot.privatePhone) {
        throw new Error("Expected a Phone writing assignment.");
      }
      await first.engine.submitPhoneText(
        sockets[index]!,
        `phone-restore-text-${index}`,
        snapshot.privatePhone.assignmentId,
        `Restart sentence ${index}`,
      );
    }
    const draftSnapshot =
      await first.engine.snapshotForSocket(sockets[0]!);
    if (draftSnapshot.mode !== "phone" || !draftSnapshot.privatePhone) {
      throw new Error("Expected a Phone drawing assignment.");
    }
    const assignmentId = draftSnapshot.privatePhone.assignmentId;
    await first.engine.submitPhoneDrawingBatch(sockets[0]!, {
      idempotencyId: "phone-restore-batch",
      assignmentId,
      strokeId: "phone-restore-op",
      chunkId: 0,
      operations: [{
        opId: "phone-restore-op",
        kind: "shape",
        shape: "ellipse",
        style: { color: "#123456", size: 8, fill: false },
        start: { x: 10, y: 20 },
        end: { x: 50, y: 60 },
      }],
    });
    const originalDeadline =
      first.engine.inspectRoom(code)!.phoneMatch!.deadlineAt;
    await vi.advanceTimersByTimeAsync(10_000);
    await first.engine.stop();

    let restoredId = 0;
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
      id: () => `phone-restored-${++restoredId}`,
      random: () => 0,
    });
    await recoveredEngine.start();
    expect(
      recoveredEngine.inspectRoom(code)?.phoneMatch?.deadlineAt,
    ).toBe(originalDeadline);

    const recoveredSessions = [];
    for (let index = 0; index < sessions.length; index += 1) {
      recoveredSessions.push(
        await recoveredEngine.connect(
          `phone-recovered-socket-${index}`,
          sessions[index]!.reconnectToken,
        ),
      );
    }
    const recoveredHost = recoveredSessions[0]!;
    if (
      recoveredHost.snapshot?.mode !== "phone" ||
      !recoveredHost.snapshot.privatePhone
    ) {
      throw new Error("Expected a restored private Phone draft.");
    }
    expect(recoveredHost.snapshot.privatePhone).toMatchObject({
      assignmentId,
      draft: {
        acceptedThroughSequence: 1,
        envelopes: [{
          operation: { opId: "phone-restore-op" },
        }],
      },
    });
    await vi.advanceTimersByTimeAsync(49_999);
    expect(recoveredEngine.inspectRoom(code)?.phase).toBe(
      "phone-drawing-1",
    );
    await vi.advanceTimersByTimeAsync(2);
    expect(recoveredEngine.inspectRoom(code)?.phase).toBe(
      "phone-guessing",
    );
    await recoveredEngine.stop();
  });
});
