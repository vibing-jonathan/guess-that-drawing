export const CANVAS_WIDTH = 1600;
export const CANVAS_HEIGHT = 1200;

export const GAME_DEFAULTS = {
  minPlayers: 2,
  maxPlayers: 12,
  roomCapacity: 8,
  drawingCycles: 2,
  turnSeconds: 80,
  wordSelectionSeconds: 15,
  phoneMinPlayers: 4,
  phoneTextSeconds: 60,
  phoneDrawingSeconds: 120,
  reconnectGraceSeconds: 30,
  drawerPauseSeconds: 20,
  emptyRoomTtlSeconds: 30 * 60,
  absoluteRoomLifetimeSeconds: 8 * 60 * 60,
  maxDrawingBatchesPerSecond: 30,
} as const;

export const VALIDATION_LIMITS = {
  playerName: { min: 2, max: 24 },
  roomCodeLength: 6,
  customThemeName: { min: 2, max: 40 },
  customThemeWords: { min: 20, max: 500 },
  themeWord: { min: 2, max: 60 },
  chatMessage: { min: 1, max: 180 },
  phoneText: { min: 1, max: 180 },
  phoneTextSeconds: { min: 30, max: 120 },
  phoneDrawingSeconds: { min: 60, max: 180 },
  drawingBatchOperations: { min: 1, max: 64 },
  drawingPointsPerOperation: { min: 1, max: 256 },
  drawingLogOperations: 10_000,
  drawingLogPoints: 120_000,
  drawingLogBytes: 8 * 1024 * 1024,
  colorLength: 32,
  idempotencyIdLength: 128,
  reconnectTokenLength: 512,
  avatarLayerValueLength: 40,
  maxSocketPayloadBytes: 256 * 1024,
  maxHttpBodyBytes: 64 * 1024,
} as const;

export const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;

export const DRAWING_SIZES = {
  min: 1,
  max: 80,
  default: 12,
} as const;

export const SCORE_RULES = {
  baseCorrect: 300,
  speedPool: 500,
  placementBonuses: [200, 100, 50] as const,
  drawerPerCorrectGuesser: 75,
  drawerMaximum: 500,
  proIncorrectGuessPenalty: 25,
} as const;

export const GAME_MODES = ["classic", "pro", "phone"] as const;

export const PHONE_ACTIVE_PHASES = [
  "phone-writing",
  "phone-drawing-1",
  "phone-guessing",
  "phone-drawing-2",
] as const;

export const SOCKET_RATE_LIMITS = {
  chatPerTenSeconds: 8,
  guessesPerTenSeconds: 12,
  drawingBatchesPerSecond: 30,
  mutationsPerTenSeconds: 30,
} as const;

export const ERROR_CODES = [
  "INVALID_PAYLOAD",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "RATE_LIMITED",
  "SERVER_UNAVAILABLE",
  "ROOM_NOT_FOUND",
  "ROOM_EXPIRED",
  "ROOM_FULL",
  "ROOM_STARTED",
  "DUPLICATE_NAME",
  "KICKED",
  "NOT_IN_ROOM",
  "NOT_HOST",
  "NOT_DRAWER",
  "INVALID_PHASE",
  "STALE_REVISION",
  "STALE_TURN",
  "DUPLICATE_EVENT",
  "INVALID_THEME",
  "INVALID_WORD",
  "DRAWING_SEQUENCE_GAP",
  "PAYLOAD_TOO_LARGE",
  "INTERNAL_ERROR",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];
