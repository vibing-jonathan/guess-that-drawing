import type {
  AvatarConfig,
  DrawingEnvelope,
  DrawingOp,
  RoomSettings,
} from "@gtd/contracts";

export type RoomPhase =
  | "lobby"
  | "selecting"
  | "drawing"
  | "turn-results"
  | "final-results";

export interface CustomThemeInput {
  id: string;
  name: string;
  words: string[];
}

export interface PlayerProfileInput {
  name: string;
  avatar: AvatarConfig;
}

export interface ServerPlayer {
  id: string;
  sessionId: string;
  name: string;
  avatar: AvatarConfig;
  score: number;
  isHost: boolean;
  joinedAt: number;
  joinOrder: number;
  connectedAt: number;
  disconnectedAt: number | null;
  socketId: string | null;
}

export interface CorrectGuessRecord {
  playerId: string;
  placement: number;
  guessedAt: number;
  scoreAwarded: number;
}

export interface ServerRound {
  turnId: string;
  drawerId: string;
  cycle: number;
  turnNumber: number;
  choices: string[];
  answer: string | null;
  normalizedAnswer: string | null;
  choiceDeadlineAt: number;
  startedAt: number | null;
  deadlineAt: number;
  resultDeadlineAt: number | null;
  pausedRemainingMs: number | null;
  pausedUntil: number | null;
  drawerPauseUsed: boolean;
  correctGuesses: CorrectGuessRecord[];
  drawerScoreAwarded: number;
  drawingLog: DrawingEnvelope[];
  drawingOperationIds: Record<string, true>;
  drawingPointCount: number;
  drawingByteCount: number;
  nextServerSequence: number;
  strokeChunks: Record<string, number>;
  undoStack: string[];
  redoStack: string[];
}

export interface CachedCommandResult {
  id: string;
  event: string;
  result: unknown;
}

export interface AuthoritativeRoom {
  code: string;
  revision: number;
  createdAt: number;
  expiresAt: number;
  lastActiveAt: number;
  phase: RoomPhase;
  settings: RoomSettings;
  customTheme: CustomThemeInput | null;
  hostPlayerId: string;
  players: ServerPlayer[];
  kickedSessionIds: string[];
  turnOrder: string[];
  pendingTurnPlayerIds: string[];
  turnIndex: number;
  currentCycle: number;
  round: ServerRound | null;
  chat: import("@gtd/contracts").ChatMessage[];
  recentCommands: Record<string, CachedCommandResult[]>;
}

export interface SessionState {
  sessionId: string;
  reconnectToken: string;
  reconnectTokenHash: string;
  roomCode: string | null;
  playerId: string | null;
  socketId: string | null;
  createdAt: number;
  expiresAt: number;
  recentCommands: CachedCommandResult[];
}

export interface EngineDelivery {
  target: { kind: "socket"; socketId: string } | { kind: "room"; roomCode: string };
  event: string;
  payload: unknown;
  exceptSocketId?: string;
}

export interface EngineTransport {
  emit(delivery: EngineDelivery): void;
  join(socketId: string, roomCode: string): Promise<void> | void;
  leave(socketId: string, roomCode: string): Promise<void> | void;
}

export const NOOP_TRANSPORT: EngineTransport = {
  emit: () => undefined,
  join: () => undefined,
  leave: () => undefined,
};

export interface CreateRoomCommand extends PlayerProfileInput {
  idempotencyId: string;
  expectedRevision?: number;
  settings: RoomSettings;
  customTheme?: CustomThemeInput;
}

export interface JoinRoomCommand extends PlayerProfileInput {
  idempotencyId: string;
  expectedRevision?: number;
  roomCode: string;
}

export interface DrawingBatchCommand {
  idempotencyId: string;
  expectedRevision?: number;
  turnId: string;
  strokeId: string;
  chunkId: number;
  operations: DrawingOp[];
}

export interface DrawingMutationCommand {
  idempotencyId: string;
  expectedRevision?: number;
  turnId: string;
}
