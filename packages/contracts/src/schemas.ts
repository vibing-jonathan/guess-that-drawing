import { z } from "zod";

import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  DRAWING_SIZES,
  ERROR_CODES,
  GAME_DEFAULTS,
  ROOM_CODE_PATTERN,
  VALIDATION_LIMITS,
} from "./constants.js";
import { normalizeGuess } from "./guess.js";

const nonBlank = (minimum: number, maximum: number) =>
  z.string().trim().min(minimum).max(maximum);

export const IdentifierSchema = z.string().min(1).max(128);
export const IsoDateTimeSchema = z.iso.datetime({ offset: true });
export const MillisecondsTimestampSchema = z.number().int().nonnegative();
export const RevisionSchema = z.number().int().nonnegative();
export const ServerSequenceSchema = z.number().int().nonnegative();
export const RoomCodeSchema = z.string().regex(ROOM_CODE_PATTERN);
export const IdempotencyIdSchema = z
  .string()
  .min(8)
  .max(VALIDATION_LIMITS.idempotencyIdLength);

export const AvatarConfigSchema = z
  .object({
    skinTone: z.enum(["porcelain", "peach", "tan", "brown", "deep"]),
    hairStyle: z.enum([
      "none",
      "short",
      "waves",
      "curls",
      "bob",
      "mohawk",
      "bun",
      "braids",
    ]),
    hairColor: z.enum([
      "black",
      "brown",
      "auburn",
      "blonde",
      "silver",
      "blue",
      "pink",
    ]),
    eyes: z.enum(["dots", "round", "happy", "wink", "glasses"]),
    mouth: z.enum(["smile", "grin", "open", "tongue", "neutral"]),
    accessory: z.enum([
      "none",
      "cap",
      "crown",
      "headphones",
      "bow",
      "party-hat",
    ]),
    backgroundColor: z
      .string()
      .trim()
      .min(1)
      .max(VALIDATION_LIMITS.colorLength),
  })
  .strict();
export type AvatarConfig = z.infer<typeof AvatarConfigSchema>;

export const DEFAULT_AVATAR: AvatarConfig = {
  skinTone: "peach",
  hairStyle: "short",
  hairColor: "brown",
  eyes: "dots",
  mouth: "smile",
  accessory: "none",
  backgroundColor: "#DCE7FF",
};

export const PlayerProfileSchema = z
  .object({
    name: nonBlank(
      VALIDATION_LIMITS.playerName.min,
      VALIDATION_LIMITS.playerName.max,
    ),
    avatar: AvatarConfigSchema,
  })
  .strict();
export type PlayerProfile = z.infer<typeof PlayerProfileSchema>;

export const PlayerPublicSchema = z
  .object({
    id: IdentifierSchema,
    name: nonBlank(
      VALIDATION_LIMITS.playerName.min,
      VALIDATION_LIMITS.playerName.max,
    ),
    avatar: AvatarConfigSchema,
    score: z.number().int().nonnegative(),
    isHost: z.boolean(),
    isConnected: z.boolean(),
    hasGuessed: z.boolean(),
    isDrawing: z.boolean(),
    joinedAt: MillisecondsTimestampSchema,
    joinOrder: z.number().int().nonnegative(),
    disconnectedUntil: MillisecondsTimestampSchema.nullable(),
  })
  .strict();
export type PlayerPublic = z.infer<typeof PlayerPublicSchema>;

export const ThemeDescriptorSchema = z
  .object({
    id: IdentifierSchema,
    name: nonBlank(
      VALIDATION_LIMITS.customThemeName.min,
      VALIDATION_LIMITS.customThemeName.max,
    ),
    isCustom: z.boolean(),
    wordCount: z.number().int().nonnegative(),
  })
  .strict();
export type ThemeDescriptor = z.infer<typeof ThemeDescriptorSchema>;

export const RoomSettingsSchema = z
  .object({
    maxPlayers: z
      .number()
      .int()
      .min(GAME_DEFAULTS.minPlayers)
      .max(GAME_DEFAULTS.maxPlayers),
    drawingCycles: z.number().int().min(1).max(10),
    turnSeconds: z.number().int().min(30).max(180),
    wordSelectionSeconds: z.number().int().min(5).max(30),
    theme: ThemeDescriptorSchema,
  })
  .strict();
export type RoomSettings = z.infer<typeof RoomSettingsSchema>;

export const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  maxPlayers: GAME_DEFAULTS.roomCapacity,
  drawingCycles: GAME_DEFAULTS.drawingCycles,
  turnSeconds: GAME_DEFAULTS.turnSeconds,
  wordSelectionSeconds: GAME_DEFAULTS.wordSelectionSeconds,
  theme: {
    id: "general",
    name: "General",
    isCustom: false,
    wordCount: 111,
  },
};

export const RoomPhaseSchema = z.enum([
  "lobby",
  "selecting",
  "drawing",
  "turn-results",
  "final-results",
]);
export type RoomPhase = z.infer<typeof RoomPhaseSchema>;

export const WordMaskSchema = z
  .object({
    pattern: z.string().max(120),
    letters: z.number().int().nonnegative(),
    words: z.number().int().positive(),
  })
  .strict();
export type WordMask = z.infer<typeof WordMaskSchema>;

export const RoundPublicSchema = z
  .object({
    turnId: IdentifierSchema,
    phase: RoomPhaseSchema.exclude(["lobby", "final-results"]),
    drawerId: IdentifierSchema,
    cycle: z.number().int().positive(),
    cycleCount: z.number().int().positive(),
    turn: z.number().int().positive(),
    turnCount: z.number().int().positive(),
    wordMask: WordMaskSchema.nullable(),
    selectionDeadline: MillisecondsTimestampSchema.nullable(),
    drawingDeadline: MillisecondsTimestampSchema.nullable(),
    pausedUntil: MillisecondsTimestampSchema.nullable(),
    guessedPlayerIds: z.array(IdentifierSchema),
    correctGuessCount: z.number().int().nonnegative(),
  })
  .strict();
export type RoundPublic = z.infer<typeof RoundPublicSchema>;

export const RoundPrivateSchema = z
  .object({
    turnId: IdentifierSchema,
    answer: nonBlank(
      VALIDATION_LIMITS.themeWord.min,
      VALIDATION_LIMITS.themeWord.max,
    ).nullable(),
    wordChoices: z
      .array(
        nonBlank(
          VALIDATION_LIMITS.themeWord.min,
          VALIDATION_LIMITS.themeWord.max,
        ),
      )
      .length(3),
  })
  .strict();
export type RoundPrivate = z.infer<typeof RoundPrivateSchema>;

export const PointSchema = z
  .object({
    x: z.number().finite().min(0).max(CANVAS_WIDTH),
    y: z.number().finite().min(0).max(CANVAS_HEIGHT),
    pressure: z.number().finite().min(0).max(1).optional(),
  })
  .strict();
export type Point = z.infer<typeof PointSchema>;

export const DrawingStyleSchema = z
  .object({
    color: z.string().trim().min(1).max(VALIDATION_LIMITS.colorLength),
    size: z.number().finite().min(DRAWING_SIZES.min).max(DRAWING_SIZES.max),
    fill: z.boolean(),
  })
  .strict();
export type DrawingStyle = z.infer<typeof DrawingStyleSchema>;

const DrawingOpBaseSchema = z.object({
  opId: IdentifierSchema,
});

export const StrokeDrawingOpSchema = DrawingOpBaseSchema.extend({
  kind: z.literal("stroke"),
  tool: z.enum(["brush", "eraser"]),
  style: DrawingStyleSchema,
  points: z
    .array(PointSchema)
    .min(VALIDATION_LIMITS.drawingPointsPerOperation.min)
    .max(VALIDATION_LIMITS.drawingPointsPerOperation.max),
}).strict();

export const ShapeDrawingOpSchema = DrawingOpBaseSchema.extend({
  kind: z.literal("shape"),
  shape: z.enum(["line", "rectangle", "ellipse"]),
  style: DrawingStyleSchema,
  start: PointSchema,
  end: PointSchema,
}).strict();

export const ClearDrawingOpSchema = DrawingOpBaseSchema.extend({
  kind: z.literal("clear"),
}).strict();

export const UndoDrawingOpSchema = DrawingOpBaseSchema.extend({
  kind: z.literal("undo"),
  targetOpId: IdentifierSchema,
}).strict();

export const RedoDrawingOpSchema = DrawingOpBaseSchema.extend({
  kind: z.literal("redo"),
  targetOpId: IdentifierSchema,
}).strict();

export const DrawingOpSchema = z.discriminatedUnion("kind", [
  StrokeDrawingOpSchema,
  ShapeDrawingOpSchema,
  ClearDrawingOpSchema,
  UndoDrawingOpSchema,
  RedoDrawingOpSchema,
]);
export type DrawingOp = z.infer<typeof DrawingOpSchema>;

export const DrawingEnvelopeSchema = z
  .object({
    turnId: IdentifierSchema,
    strokeId: IdentifierSchema,
    chunkId: z.number().int().nonnegative(),
    serverSequence: ServerSequenceSchema,
    operation: DrawingOpSchema,
  })
  .strict();
export type DrawingEnvelope = z.infer<typeof DrawingEnvelopeSchema>;

export const ChatMessageSchema = z
  .object({
    id: IdentifierSchema,
    roomRevision: RevisionSchema,
    playerId: IdentifierSchema,
    playerName: nonBlank(
      VALIDATION_LIMITS.playerName.min,
      VALIDATION_LIMITS.playerName.max,
    ),
    text: nonBlank(
      VALIDATION_LIMITS.chatMessage.min,
      VALIDATION_LIMITS.chatMessage.max,
    ),
    createdAt: MillisecondsTimestampSchema,
  })
  .strict();
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const GuessKindSchema = z.enum(["incorrect", "close", "correct"]);
export type GuessKind = z.infer<typeof GuessKindSchema>;

export const GuessFeedbackSchema = z
  .object({
    kind: GuessKindSchema,
    turnId: IdentifierSchema,
    message: z.string().min(1).max(100),
    scoreAwarded: z.number().int().nonnegative(),
    placement: z.number().int().positive().nullable(),
  })
  .strict();
export type GuessFeedback = z.infer<typeof GuessFeedbackSchema>;

export const CorrectGuessEventSchema = z
  .object({
    turnId: IdentifierSchema,
    playerId: IdentifierSchema,
    playerName: nonBlank(
      VALIDATION_LIMITS.playerName.min,
      VALIDATION_LIMITS.playerName.max,
    ),
    placement: z.number().int().positive(),
    guessedAt: MillisecondsTimestampSchema,
  })
  .strict();
export type CorrectGuessEvent = z.infer<typeof CorrectGuessEventSchema>;

export const ScoreChangeSchema = z
  .object({
    playerId: IdentifierSchema,
    delta: z.number().int(),
    total: z.number().int().nonnegative(),
    reason: z.enum(["correct-guess", "drawer-guesses", "adjustment"]),
  })
  .strict();
export type ScoreChange = z.infer<typeof ScoreChangeSchema>;

export const TurnResultSchema = z
  .object({
    turnId: IdentifierSchema,
    answer: nonBlank(
      VALIDATION_LIMITS.themeWord.min,
      VALIDATION_LIMITS.themeWord.max,
    ),
    drawerId: IdentifierSchema,
    correctPlayerIds: z.array(IdentifierSchema),
    scoreChanges: z.array(ScoreChangeSchema),
    endedAt: MillisecondsTimestampSchema,
    reason: z.enum([
      "time-expired",
      "all-guessed",
      "drawer-disconnected",
      "drawer-left",
      "host-ended",
    ]),
  })
  .strict();
export type TurnResult = z.infer<typeof TurnResultSchema>;

export const ReplayStateSchema = z
  .object({
    revision: RevisionSchema,
    turnId: IdentifierSchema,
    fromSequence: ServerSequenceSchema,
    throughSequence: ServerSequenceSchema,
    operations: z
      .array(DrawingEnvelopeSchema)
      .max(VALIDATION_LIMITS.drawingLogOperations),
  })
  .strict();
export type ReplayState = z.infer<typeof ReplayStateSchema>;

export const RoomSnapshotSchema = z
  .object({
    code: RoomCodeSchema,
    revision: RevisionSchema,
    phase: RoomPhaseSchema,
    settings: RoomSettingsSchema,
    players: z.array(PlayerPublicSchema).max(GAME_DEFAULTS.maxPlayers),
    round: RoundPublicSchema.nullable(),
    drawing: ReplayStateSchema.nullable(),
    chat: z.array(ChatMessageSchema).max(200),
    serverTime: MillisecondsTimestampSchema,
    createdAt: MillisecondsTimestampSchema,
    expiresAt: MillisecondsTimestampSchema,
  })
  .strict();
export type RoomSnapshot = z.infer<typeof RoomSnapshotSchema>;

export const PlayerRoomSnapshotSchema = RoomSnapshotSchema.extend({
  selfPlayerId: IdentifierSchema,
  privateRound: RoundPrivateSchema.nullable(),
}).strict();
export type PlayerRoomSnapshot = z.infer<typeof PlayerRoomSnapshotSchema>;

export const ErrorCodeSchema = z.enum(ERROR_CODES);
export const ContractErrorSchema = z
  .object({
    code: ErrorCodeSchema,
    message: z.string().min(1).max(240),
    retryable: z.boolean(),
    details: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export type ContractError = z.infer<typeof ContractErrorSchema>;

export const AckMetaSchema = z
  .object({
    idempotencyId: IdempotencyIdSchema.optional(),
    revision: RevisionSchema.optional(),
    serverTime: MillisecondsTimestampSchema,
  })
  .strict();
export type AckMeta = z.infer<typeof AckMetaSchema>;

export const createAckEnvelopeSchema = <T extends z.ZodType>(
  dataSchema: T,
) =>
  z.discriminatedUnion("ok", [
    z
      .object({
        ok: z.literal(true),
        data: dataSchema,
        meta: AckMetaSchema,
      })
      .strict(),
    z
      .object({
        ok: z.literal(false),
        error: ContractErrorSchema,
        meta: AckMetaSchema,
      })
      .strict(),
  ]);

export type AckSuccess<T> = {
  ok: true;
  data: T;
  meta: AckMeta;
};
export type AckFailure = {
  ok: false;
  error: ContractError;
  meta: AckMeta;
};
export type AckEnvelope<T> = AckSuccess<T> | AckFailure;

export const MutationMetaSchema = z
  .object({
    idempotencyId: IdempotencyIdSchema,
    expectedRevision: RevisionSchema.optional(),
  })
  .strict();
export type MutationMeta = z.infer<typeof MutationMetaSchema>;

export const SessionCredentialsSchema = z
  .object({
    playerId: IdentifierSchema,
    reconnectToken: z
      .string()
      .min(16)
      .max(VALIDATION_LIMITS.reconnectTokenLength),
  })
  .strict();
export type SessionCredentials = z.infer<typeof SessionCredentialsSchema>;

export const CustomThemeInputBaseSchema = z
  .object({
    id: IdentifierSchema.optional(),
    name: nonBlank(
      VALIDATION_LIMITS.customThemeName.min,
      VALIDATION_LIMITS.customThemeName.max,
    ),
    words: z
      .array(
        nonBlank(
          VALIDATION_LIMITS.themeWord.min,
          VALIDATION_LIMITS.themeWord.max,
        ),
      )
      .min(VALIDATION_LIMITS.customThemeWords.min)
      .max(VALIDATION_LIMITS.customThemeWords.max),
  })
  .strict();

export const CustomThemeInputSchema = CustomThemeInputBaseSchema.superRefine(
  (theme, context) => {
    const seen = new Set<string>();
    theme.words.forEach((word, index) => {
      const normalized = normalizeGuess(word);
      if (normalized.length === 0) {
        context.addIssue({
          code: "custom",
          message: "A theme word must contain at least one letter or number.",
          path: ["words", index],
        });
      } else if (seen.has(normalized)) {
        context.addIssue({
          code: "custom",
          message: "Theme words must be unique after normalization.",
          path: ["words", index],
        });
      }
      seen.add(normalized);
    });
  },
);
export type CustomThemeInput = z.infer<typeof CustomThemeInputSchema>;

export const ThemeMetadataSchema = ThemeDescriptorSchema.extend({
  description: z.string().min(1).max(160),
}).strict();
export type ThemeMetadata = z.infer<typeof ThemeMetadataSchema>;

export const CreateRoomRequestSchema = z
  .object({
    mutation: MutationMetaSchema,
    profile: PlayerProfileSchema,
    settings: RoomSettingsSchema,
    customTheme: CustomThemeInputSchema.optional(),
  })
  .strict();
export type CreateRoomRequest = z.infer<typeof CreateRoomRequestSchema>;

export const JoinRoomRequestSchema = z
  .object({
    mutation: MutationMetaSchema,
    code: RoomCodeSchema,
    profile: PlayerProfileSchema,
  })
  .strict();
export type JoinRoomRequest = z.infer<typeof JoinRoomRequestSchema>;

export const ResumeSessionRequestSchema = z
  .object({
    code: RoomCodeSchema,
    credentials: SessionCredentialsSchema,
    lastRoomRevision: RevisionSchema.optional(),
    lastDrawingSequence: ServerSequenceSchema.optional(),
  })
  .strict();
export type ResumeSessionRequest = z.infer<typeof ResumeSessionRequestSchema>;

export const LeaveRoomRequestSchema = z
  .object({
    mutation: MutationMetaSchema,
  })
  .strict();
export type LeaveRoomRequest = z.infer<typeof LeaveRoomRequestSchema>;

export const UpdateProfileRequestSchema = z
  .object({
    mutation: MutationMetaSchema,
    profile: PlayerProfileSchema,
  })
  .strict();
export type UpdateProfileRequest = z.infer<typeof UpdateProfileRequestSchema>;

export const UpdateSettingsRequestSchema = z
  .object({
    mutation: MutationMetaSchema,
    settings: RoomSettingsSchema,
    customTheme: CustomThemeInputSchema.optional(),
  })
  .strict();
export type UpdateSettingsRequest = z.infer<typeof UpdateSettingsRequestSchema>;

export const KickPlayerRequestSchema = z
  .object({
    mutation: MutationMetaSchema,
    playerId: IdentifierSchema,
  })
  .strict();
export type KickPlayerRequest = z.infer<typeof KickPlayerRequestSchema>;

export const StartMatchRequestSchema = z
  .object({
    mutation: MutationMetaSchema,
  })
  .strict();
export type StartMatchRequest = z.infer<typeof StartMatchRequestSchema>;

export const SelectWordRequestSchema = z
  .object({
    mutation: MutationMetaSchema,
    turnId: IdentifierSchema,
    choiceIndex: z.number().int().min(0).max(2),
  })
  .strict();
export type SelectWordRequest = z.infer<typeof SelectWordRequestSchema>;

export const DrawingBatchRequestSchema = z
  .object({
    mutation: MutationMetaSchema,
    turnId: IdentifierSchema,
    strokeId: IdentifierSchema,
    chunkId: z.number().int().nonnegative(),
    operations: z
      .array(DrawingOpSchema)
      .min(VALIDATION_LIMITS.drawingBatchOperations.min)
      .max(VALIDATION_LIMITS.drawingBatchOperations.max),
  })
  .strict();
export type DrawingBatchRequest = z.infer<typeof DrawingBatchRequestSchema>;

export const ChatSendRequestSchema = z
  .object({
    mutation: MutationMetaSchema,
    text: nonBlank(
      VALIDATION_LIMITS.chatMessage.min,
      VALIDATION_LIMITS.chatMessage.max,
    ),
  })
  .strict();
export type ChatSendRequest = z.infer<typeof ChatSendRequestSchema>;

export const GuessSubmitRequestSchema = z
  .object({
    mutation: MutationMetaSchema,
    turnId: IdentifierSchema,
    text: nonBlank(
      VALIDATION_LIMITS.chatMessage.min,
      VALIDATION_LIMITS.chatMessage.max,
    ),
  })
  .strict();
export type GuessSubmitRequest = z.infer<typeof GuessSubmitRequestSchema>;

export const SnapshotRequestSchema = z
  .object({
    lastRoomRevision: RevisionSchema.optional(),
    lastDrawingSequence: ServerSequenceSchema.optional(),
  })
  .strict();
export type SnapshotRequest = z.infer<typeof SnapshotRequestSchema>;

export const DrawingReplayRequestSchema = z
  .object({
    turnId: IdentifierSchema,
    afterSequence: ServerSequenceSchema,
  })
  .strict();
export type DrawingReplayRequest = z.infer<typeof DrawingReplayRequestSchema>;

export const EmptySuccessSchema = z.object({}).strict();
export type EmptySuccess = z.infer<typeof EmptySuccessSchema>;

export const SessionEstablishedSchema = z
  .object({
    credentials: SessionCredentialsSchema,
    snapshot: PlayerRoomSnapshotSchema,
    recovered: z.boolean(),
  })
  .strict();
export type SessionEstablished = z.infer<typeof SessionEstablishedSchema>;

export const RoomMutationResultSchema = z
  .object({
    revision: RevisionSchema,
    snapshot: PlayerRoomSnapshotSchema.optional(),
  })
  .strict();
export type RoomMutationResult = z.infer<typeof RoomMutationResultSchema>;

export const DrawingBatchResultSchema = z
  .object({
    revision: RevisionSchema,
    acceptedThroughSequence: ServerSequenceSchema,
  })
  .strict();
export type DrawingBatchResult = z.infer<typeof DrawingBatchResultSchema>;

export const RoomRevisionEventSchema = z
  .object({
    revision: RevisionSchema,
  })
  .strict();
export type RoomRevisionEvent = z.infer<typeof RoomRevisionEventSchema>;

export const PlayerEventSchema = RoomRevisionEventSchema.extend({
  player: PlayerPublicSchema,
}).strict();
export type PlayerEvent = z.infer<typeof PlayerEventSchema>;

export const PlayerLeftEventSchema = RoomRevisionEventSchema.extend({
  playerId: IdentifierSchema,
  reason: z.enum(["left", "disconnected", "kicked", "expired"]),
  reconnectDeadline: MillisecondsTimestampSchema.nullable(),
}).strict();
export type PlayerLeftEvent = z.infer<typeof PlayerLeftEventSchema>;

export const HostTransferredEventSchema = RoomRevisionEventSchema.extend({
  previousHostId: IdentifierSchema,
  hostId: IdentifierSchema,
}).strict();
export type HostTransferredEvent = z.infer<
  typeof HostTransferredEventSchema
>;

export const SettingsUpdatedEventSchema = RoomRevisionEventSchema.extend({
  settings: RoomSettingsSchema,
}).strict();
export type SettingsUpdatedEvent = z.infer<
  typeof SettingsUpdatedEventSchema
>;

export const RoundEventSchema = RoomRevisionEventSchema.extend({
  round: RoundPublicSchema,
}).strict();
export type RoundEvent = z.infer<typeof RoundEventSchema>;

export const RoundPrivateEventSchema = RoomRevisionEventSchema.extend({
  privateRound: RoundPrivateSchema,
}).strict();
export type RoundPrivateEvent = z.infer<typeof RoundPrivateEventSchema>;

export const TurnEndedEventSchema = RoomRevisionEventSchema.extend({
  result: TurnResultSchema,
  snapshot: RoomSnapshotSchema,
}).strict();
export type TurnEndedEvent = z.infer<typeof TurnEndedEventSchema>;

export const ScoreUpdatedEventSchema = RoomRevisionEventSchema.extend({
  changes: z.array(ScoreChangeSchema),
}).strict();
export type ScoreUpdatedEvent = z.infer<typeof ScoreUpdatedEventSchema>;

export const DrawingBroadcastSchema = RoomRevisionEventSchema.extend({
  envelopes: z.array(DrawingEnvelopeSchema),
}).strict();
export type DrawingBroadcast = z.infer<typeof DrawingBroadcastSchema>;

export const ChatMessageEventSchema = RoomRevisionEventSchema.extend({
  message: ChatMessageSchema,
}).strict();
export type ChatMessageEvent = z.infer<typeof ChatMessageEventSchema>;

export const GuessFeedbackEventSchema = RoomRevisionEventSchema.extend({
  feedbackId: IdentifierSchema,
  feedback: GuessFeedbackSchema,
}).strict();
export type GuessFeedbackEvent = z.infer<typeof GuessFeedbackEventSchema>;

export const CorrectGuessBroadcastSchema = RoomRevisionEventSchema.extend({
  guess: CorrectGuessEventSchema,
}).strict();
export type CorrectGuessBroadcast = z.infer<
  typeof CorrectGuessBroadcastSchema
>;

export const ConnectionStateEventSchema = z
  .object({
    state: z.enum(["connected", "recovering", "reconnected", "offline"]),
    message: z.string().min(1).max(160).optional(),
  })
  .strict();
export type ConnectionStateEvent = z.infer<
  typeof ConnectionStateEventSchema
>;

export const KickedEventSchema = RoomRevisionEventSchema.extend({
  code: z.enum(["KICKED", "ROOM_EXPIRED"]),
  reason: z.string().min(1).max(160),
}).strict();
export type KickedEvent = z.infer<typeof KickedEventSchema>;

export const DrawingResetEventSchema = RoomRevisionEventSchema.extend({
  turnId: IdentifierSchema,
  throughSequence: ServerSequenceSchema,
}).strict();
export type DrawingResetEvent = z.infer<typeof DrawingResetEventSchema>;

export const MatchFinishedEventSchema = RoomRevisionEventSchema.extend({
  snapshot: PlayerRoomSnapshotSchema,
}).strict();
export type MatchFinishedEvent = z.infer<typeof MatchFinishedEventSchema>;

export const SnapshotRequiredEventSchema = z
  .object({
    reason: z.enum([
      "stale-revision",
      "drawing-gap",
      "recovery-failed",
    ]),
    currentRevision: RevisionSchema,
  })
  .strict();
export type SnapshotRequiredEvent = z.infer<
  typeof SnapshotRequiredEventSchema
>;

export const ServerShutdownEventSchema = z
  .object({
    message: z.string().min(1).max(160),
  })
  .strict();
export type ServerShutdownEvent = z.infer<
  typeof ServerShutdownEventSchema
>;

export const HealthResponseSchema = z
  .object({
    status: z.enum(["ok", "degraded"]),
    redis: z.enum(["up", "down"]),
    uptimeSeconds: z.number().nonnegative(),
  })
  .strict();
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const ThemesResponseSchema = z
  .object({
    themes: z.array(ThemeMetadataSchema),
  })
  .strict();
export type ThemesResponse = z.infer<typeof ThemesResponseSchema>;
