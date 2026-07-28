import { describe, expect, expectTypeOf, it } from "vitest";

import {
  AvatarConfigSchema,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  CreateRoomRequestSchema,
  CustomThemeInputSchema,
  DEFAULT_AVATAR,
  DEFAULT_ROOM_SETTINGS,
  DrawingBatchRequestSchema,
  DrawingOpSchema,
  PlayerRoomSnapshotSchema,
  RoomSettingsSchema,
  RoomSnapshotSchema,
  createAckEnvelopeSchema,
  type AckEnvelope,
  type ClientToServerEvents,
  type DrawingOp,
  type ServerToClientEvents,
} from "../src/index.js";

describe("core schemas", () => {
  it("accepts default avatar and room settings", () => {
    expect(AvatarConfigSchema.parse(DEFAULT_AVATAR)).toEqual(DEFAULT_AVATAR);
    expect(RoomSettingsSchema.parse(DEFAULT_ROOM_SETTINGS)).toEqual(
      DEFAULT_ROOM_SETTINGS,
    );
  });

  it("enforces room setting boundaries", () => {
    expect(
      RoomSettingsSchema.safeParse({
        ...DEFAULT_ROOM_SETTINGS,
        maxPlayers: 1,
      }).success,
    ).toBe(false);
    expect(
      RoomSettingsSchema.safeParse({
        ...DEFAULT_ROOM_SETTINGS,
        maxPlayers: 12,
        turnSeconds: 180,
      }).success,
    ).toBe(true);
  });

  it("validates all drawing operation variants and canvas bounds", () => {
    const operations: DrawingOp[] = [
      {
        opId: "stroke-1",
        kind: "stroke",
        tool: "brush",
        style: { color: "#1F2937", size: 12, fill: false },
        points: [
          { x: 0, y: 0, pressure: 0.5 },
          { x: CANVAS_WIDTH, y: CANVAS_HEIGHT },
        ],
      },
      {
        opId: "shape-1",
        kind: "shape",
        shape: "ellipse",
        style: { color: "#185ADB", size: 6, fill: true },
        start: { x: 10, y: 20 },
        end: { x: 100, y: 120 },
      },
      { opId: "clear-1", kind: "clear" },
      { opId: "undo-1", kind: "undo", targetOpId: "shape-1" },
      { opId: "redo-1", kind: "redo", targetOpId: "shape-1" },
    ];

    for (const operation of operations) {
      expect(DrawingOpSchema.parse(operation)).toEqual(operation);
    }

    expect(
      DrawingOpSchema.safeParse({
        ...operations[0],
        points: [{ x: CANVAS_WIDTH + 1, y: 0 }],
      }).success,
    ).toBe(false);
  });

  it("requires idempotency metadata for mutations", () => {
    const request = {
      mutation: { idempotencyId: "request-12345678" },
      profile: { name: "Sketchy", avatar: DEFAULT_AVATAR },
      settings: DEFAULT_ROOM_SETTINGS,
    };

    expect(CreateRoomRequestSchema.parse(request)).toEqual(request);
    expect(
      CreateRoomRequestSchema.safeParse({
        ...request,
        mutation: {},
      }).success,
    ).toBe(false);
  });

  it("requires turn, stroke, and chunk identifiers for drawing batches", () => {
    const batch = {
      mutation: { idempotencyId: "drawing-12345678" },
      turnId: "turn-1",
      strokeId: "stroke-1",
      chunkId: 0,
      operations: [
        {
          opId: "stroke-1-0",
          kind: "stroke",
          tool: "brush",
          style: { color: "#000000", size: 8, fill: false },
          points: [{ x: 10, y: 10 }],
        },
      ],
    };
    expect(DrawingBatchRequestSchema.safeParse(batch).success).toBe(true);
    const { chunkId: _chunkId, ...withoutChunk } = batch;
    expect(DrawingBatchRequestSchema.safeParse(withoutChunk).success).toBe(
      false,
    );
  });

  it("enforces bounded drawing batches and point payloads", () => {
    const operation = {
      opId: "stroke-1",
      kind: "stroke" as const,
      tool: "brush" as const,
      style: { color: "#000000", size: 8, fill: false },
      points: Array.from({ length: 257 }, (_, index) => ({
        x: index,
        y: index,
      })),
    };
    expect(DrawingOpSchema.safeParse(operation).success).toBe(false);

    expect(
      DrawingBatchRequestSchema.safeParse({
        mutation: { idempotencyId: "drawing-12345678" },
        turnId: "turn-1",
        strokeId: "stroke-1",
        chunkId: 0,
        operations: Array.from({ length: 65 }, (_, index) => ({
          opId: `clear-${index}`,
          kind: "clear",
        })),
      }).success,
    ).toBe(false);
  });

  it("makes normalized custom-theme uniqueness part of the schema contract", () => {
    const words = Array.from({ length: 20 }, (_, index) => `word ${index}`);
    words[19] = "Wörd-1!";
    expect(
      CustomThemeInputSchema.safeParse({
        name: "Duplicates",
        words,
      }).success,
    ).toBe(false);
  });
});

describe("secret redaction", () => {
  const publicSnapshot = {
    code: "ABC234",
    revision: 4,
    phase: "lobby",
    settings: DEFAULT_ROOM_SETTINGS,
    players: [],
    round: null,
    drawing: null,
    chat: [],
    serverTime: 1_000,
    createdAt: 500,
    expiresAt: 2_000,
  };

  it("keeps the public snapshot schema free of drawer-only fields", () => {
    expect(RoomSnapshotSchema.parse(publicSnapshot)).toEqual(publicSnapshot);
    expect(
      RoomSnapshotSchema.safeParse({
        ...publicSnapshot,
        privateRound: {
          turnId: "turn-1",
          answer: "secret",
          wordChoices: ["secret", "hidden", "private"],
        },
      }).success,
    ).toBe(false);
  });

  it("allows private round data only in a player-targeted snapshot", () => {
    const privateSnapshot = {
      ...publicSnapshot,
      selfPlayerId: "player-1",
      privateRound: {
        turnId: "turn-1",
        answer: null,
        wordChoices: ["secret", "hidden", "private"],
      },
    };
    expect(PlayerRoomSnapshotSchema.parse(privateSnapshot)).toEqual(
      privateSnapshot,
    );
  });
});

describe("acknowledgements and event maps", () => {
  it("validates successful and failed acknowledgement envelopes", () => {
    const schema = createAckEnvelopeSchema(RoomSettingsSchema);
    expect(
      schema.safeParse({
        ok: true,
        data: DEFAULT_ROOM_SETTINGS,
        meta: { serverTime: 1, revision: 2 },
      }).success,
    ).toBe(true);
    expect(
      schema.safeParse({
        ok: false,
        error: {
          code: "STALE_REVISION",
          message: "Refresh required",
          retryable: true,
        },
        meta: { serverTime: 1, revision: 3 },
      }).success,
    ).toBe(true);
  });

  it("exports strongly typed acknowledgement and Socket.IO maps", () => {
    expectTypeOf<ClientToServerEvents>().toBeObject();
    expectTypeOf<ServerToClientEvents>().toBeObject();
    expectTypeOf<AckEnvelope<{ revision: number }>>().toMatchTypeOf<
      | {
          ok: true;
          data: { revision: number };
          meta: { serverTime: number };
        }
      | {
          ok: false;
          error: { code: string; message: string; retryable: boolean };
          meta: { serverTime: number };
        }
    >();
  });
});
