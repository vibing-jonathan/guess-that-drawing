import { describe, expect, expectTypeOf, it } from "vitest";

import {
  DEFAULT_AVATAR,
  DEFAULT_PHONE_ROOM_SETTINGS,
  DEFAULT_ROOM_SETTINGS,
  GAME_MODES,
  GuessFeedbackSchema,
  PhoneDrawingBatchRequestSchema,
  PhoneDrawingSubmitRequestSchema,
  PhonePlayerRoomSnapshotSchema,
  PhoneSummaryNavigateRequestSchema,
  PhoneTextSubmitRequestSchema,
  PlayerRoomSnapshotSchema,
  RoomSettingsSchema,
  RoomSnapshotSchema,
  ScoreChangeSchema,
  type ClientToServerEvents,
  type PhoneDrawingEnvelope,
  type PhoneRoomSettings,
  type RoomSettings,
  type ServerToClientEvents,
} from "../src/index.js";

const legacySettings = {
  maxPlayers: 8,
  drawingCycles: 2,
  turnSeconds: 80,
  wordSelectionSeconds: 15,
  theme: {
    id: "general",
    name: "General",
    isCustom: false,
    wordCount: 111,
  },
};

const snapshotBase = {
  code: "ABC234",
  revision: 4,
  players: [],
  chat: [],
  serverTime: 1_000,
  createdAt: 500,
  expiresAt: 2_000,
};

const participants = Array.from({ length: 4 }, (_, index) => ({
  playerId: `player-${index + 1}`,
  playerName: `Player ${index + 1}`,
  avatar: DEFAULT_AVATAR,
  status: index === 0 ? ("submitted" as const) : ("working" as const),
}));

const drawingEnvelope: PhoneDrawingEnvelope = {
  assignmentId: "assignment-2",
  strokeId: "stroke-1",
  chunkId: 0,
  serverSequence: 1,
  operation: {
    opId: "stroke-1:0",
    kind: "stroke",
    tool: "brush",
    style: { color: "#000000", size: 8, fill: false },
    points: [{ x: 10, y: 10 }],
  },
};

describe("game mode settings", () => {
  it("exports the supported modes and normalizes legacy settings to Classic", () => {
    expect(GAME_MODES).toEqual(["classic", "pro", "phone"]);
    expect(RoomSettingsSchema.parse(legacySettings)).toEqual({
      mode: "classic",
      ...legacySettings,
    });
    expect(RoomSettingsSchema.parse(DEFAULT_ROOM_SETTINGS)).toEqual(
      DEFAULT_ROOM_SETTINGS,
    );
  });

  it("keeps Classic and Pro settings separate from Phone settings", () => {
    expect(
      RoomSettingsSchema.safeParse({
        ...DEFAULT_ROOM_SETTINGS,
        mode: "pro",
      }).success,
    ).toBe(true);
    expect(RoomSettingsSchema.parse(DEFAULT_PHONE_ROOM_SETTINGS)).toEqual(
      DEFAULT_PHONE_ROOM_SETTINGS,
    );
    expect(
      RoomSettingsSchema.safeParse({
        ...DEFAULT_PHONE_ROOM_SETTINGS,
        maxPlayers: 3,
      }).success,
    ).toBe(false);
    expect(
      RoomSettingsSchema.safeParse({
        ...DEFAULT_PHONE_ROOM_SETTINGS,
        theme: legacySettings.theme,
      }).success,
    ).toBe(false);
  });

  it("exposes a discriminated settings union to TypeScript", () => {
    expectTypeOf<RoomSettings>().toMatchTypeOf<
      | { mode: "classic" | "pro"; theme: { id: string } }
      | {
          mode: "phone";
          maxPlayers: number;
          textSeconds: number;
          drawingSeconds: number;
        }
    >();
    expectTypeOf<PhoneRoomSettings["mode"]>().toEqualTypeOf<"phone">();
  });
});

describe("Phone snapshot privacy", () => {
  const activePublicSnapshot = {
    ...snapshotBase,
    mode: "phone" as const,
    phase: "phone-writing" as const,
    settings: DEFAULT_PHONE_ROOM_SETTINGS,
    round: null,
    drawing: null,
    phone: {
      matchId: "match-1",
      phase: "phone-writing" as const,
      deadline: 10_000,
      submittedCount: 1,
      totalCount: 4,
      participants,
    },
  };

  it("publishes only aggregate active-phase state", () => {
    expect(RoomSnapshotSchema.parse(activePublicSnapshot)).toEqual(
      activePublicSnapshot,
    );
    expect(
      RoomSnapshotSchema.safeParse({
        ...activePublicSnapshot,
        phone: {
          ...activePublicSnapshot.phone,
          prompt: { kind: "text", text: "A secret sentence" },
        },
      }).success,
    ).toBe(false);
    expect(
      RoomSnapshotSchema.safeParse({
        ...activePublicSnapshot,
        privatePhone: {
          assignmentId: "assignment-1",
        },
      }).success,
    ).toBe(false);
  });

  it("targets one assignment, prompt, and owned draft privately", () => {
    const privateSnapshot = {
      ...activePublicSnapshot,
      selfPlayerId: "player-1",
      privatePhone: {
        matchId: "match-1",
        phase: "phone-writing" as const,
        assignmentId: "assignment-1",
        prompt: null,
        skippedEntryCount: 0,
        draft: null,
        submitted: false,
      },
    };
    expect(PlayerRoomSnapshotSchema.parse(privateSnapshot)).toEqual(
      privateSnapshot,
    );
    expect(PhonePlayerRoomSnapshotSchema.parse(privateSnapshot)).toEqual(
      privateSnapshot,
    );
    expect(
      PlayerRoomSnapshotSchema.safeParse({
        ...privateSnapshot,
        privateRound: {
          turnId: "turn-1",
          answer: "secret",
          wordChoices: ["one", "two", "three"],
        },
      }).success,
    ).toBe(false);
  });

  it("reveals exactly the synchronized storyline prefix with attribution", () => {
    const firstEntry = {
      id: "entry-1",
      phase: "phone-writing" as const,
      kind: "text" as const,
      author: { playerId: "player-1", playerName: "Player One" },
      text: "A penguin opens a bakery",
    };
    const secondEntry = {
      id: "entry-2",
      phase: "phone-drawing-1" as const,
      kind: "drawing" as const,
      author: { playerId: "player-2", playerName: "Player Two" },
      envelopes: [drawingEnvelope],
    };
    const summarySnapshot = {
      ...snapshotBase,
      mode: "phone" as const,
      phase: "phone-summary" as const,
      settings: DEFAULT_PHONE_ROOM_SETTINGS,
      round: null,
      drawing: null,
      phone: {
        matchId: "match-1",
        phase: "phone-summary" as const,
        storyCount: 4,
        cursor: { storyIndex: 0, entryIndex: 0 },
        storyline: { id: "story-1", entries: [firstEntry] },
      },
    };
    expect(RoomSnapshotSchema.parse(summarySnapshot)).toEqual(
      summarySnapshot,
    );
    expect(
      RoomSnapshotSchema.safeParse({
        ...summarySnapshot,
        phone: {
          ...summarySnapshot.phone,
          storyline: {
            ...summarySnapshot.phone.storyline,
            entries: [firstEntry, secondEntry],
          },
        },
      }).success,
    ).toBe(false);
  });

  it("normalizes an old snapshot without either mode field to Classic", () => {
    const legacySnapshot = {
      ...snapshotBase,
      phase: "lobby",
      settings: legacySettings,
      round: null,
      drawing: null,
    };
    expect(RoomSnapshotSchema.parse(legacySnapshot)).toMatchObject({
      mode: "classic",
      settings: { mode: "classic" },
    });
  });
});

describe("Pro scoring and Phone mutations", () => {
  it("uses signed guess deltas and supports incorrect-guess score changes", () => {
    expect(
      GuessFeedbackSchema.parse({
        kind: "incorrect",
        turnId: "turn-1",
        message: "Incorrect. -25 points",
        scoreDelta: -25,
        placement: null,
      }),
    ).toMatchObject({ scoreDelta: -25 });
    expect(
      GuessFeedbackSchema.safeParse({
        kind: "correct",
        turnId: "turn-1",
        message: "Correct",
        scoreAwarded: 300,
        placement: 1,
      }).success,
    ).toBe(false);
    expect(
      ScoreChangeSchema.safeParse({
        playerId: "player-1",
        delta: -25,
        total: 0,
        reason: "incorrect-guess",
      }).success,
    ).toBe(true);
  });

  it("validates assignment-scoped Phone requests", () => {
    const mutation = { idempotencyId: "phone-request-12345678" };
    expect(
      PhoneTextSubmitRequestSchema.parse({
        mutation,
        assignmentId: "assignment-1",
        text: "  A mysterious lighthouse  ",
      }).text,
    ).toBe("A mysterious lighthouse");
    expect(
      PhoneDrawingBatchRequestSchema.safeParse({
        mutation,
        assignmentId: "assignment-2",
        strokeId: "stroke-1",
        chunkId: 0,
        operations: [drawingEnvelope.operation],
      }).success,
    ).toBe(true);
    expect(
      PhoneDrawingSubmitRequestSchema.safeParse({
        mutation,
        assignmentId: "assignment-2",
      }).success,
    ).toBe(true);
    expect(
      PhoneSummaryNavigateRequestSchema.safeParse({
        mutation,
        action: "finish",
      }).success,
    ).toBe(true);
    expect(
      PhoneTextSubmitRequestSchema.safeParse({
        mutation: { ...mutation, expectedRevision: 4 },
        assignmentId: "assignment-1",
        text: "Late-safe assignment mutation",
      }).success,
    ).toBe(false);
  });

  it("adds Phone methods to both Socket.IO event maps", () => {
    expectTypeOf<
      ClientToServerEvents["phone:text:submit"]
    >().toBeFunction();
    expectTypeOf<
      ClientToServerEvents["phone:drawing:batch"]
    >().toBeFunction();
    expectTypeOf<
      ClientToServerEvents["phone:drawing:submit"]
    >().toBeFunction();
    expectTypeOf<
      ClientToServerEvents["phone:summary:navigate"]
    >().toBeFunction();
    expectTypeOf<ServerToClientEvents["phone:state"]>().toBeFunction();
    expectTypeOf<ServerToClientEvents["phone:private"]>().toBeFunction();
  });
});
