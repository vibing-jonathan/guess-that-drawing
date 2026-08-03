import type {
  AvatarConfig,
  DrawingEnvelope,
  DrawingOp,
  PhoneActivePhase,
  PhoneDrawingEnvelope,
  RoomPhase,
  RoomSettings,
  ScoreChange,
} from "@gtd/contracts";

export type { RoomPhase };

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
  scoreChanges: ScoreChange[];
  drawingLog: DrawingEnvelope[];
  drawingOperationIds: Record<string, true>;
  drawingPointCount: number;
  drawingByteCount: number;
  nextServerSequence: number;
  strokeChunks: Record<string, number>;
  undoStack: string[];
  redoStack: string[];
}

export interface FrozenPhoneParticipant {
  playerId: string;
  playerName: string;
  avatar: AvatarConfig;
  joinedAt: number;
  joinOrder: number;
}

export interface ServerPhoneDrawingState {
  envelopes: PhoneDrawingEnvelope[];
  operationIds: Record<string, true>;
  pointCount: number;
  byteCount: number;
  nextServerSequence: number;
  strokeChunks: Record<string, number>;
  undoStack: string[];
  redoStack: string[];
}

interface ServerPhoneEntryBase {
  id: string;
  phase: PhoneActivePhase;
  contributorPlayerId: string;
  status: "working" | "submitted" | "skipped";
  submittedAt: number | null;
  skippedReason:
    | "timeout"
    | "left"
    | "kicked"
    | "disconnected"
    | null;
}

export interface ServerPhoneTextEntry extends ServerPhoneEntryBase {
  phase: "phone-writing" | "phone-guessing";
  kind: "text";
  text: string | null;
}

export interface ServerPhoneDrawingEntry extends ServerPhoneEntryBase {
  phase: "phone-drawing-1" | "phone-drawing-2";
  kind: "drawing";
  drawing: ServerPhoneDrawingState;
}

export type ServerPhoneEntry =
  | ServerPhoneTextEntry
  | ServerPhoneDrawingEntry;

export interface ServerPhoneStoryline {
  id: string;
  ownerPlayerId: string;
  entries: ServerPhoneEntry[];
}

export interface ServerPhoneMatch {
  matchId: string;
  participantOrder: FrozenPhoneParticipant[];
  assignmentOffsets: [number, number, number];
  phaseIndex: 0 | 1 | 2 | 3;
  phaseStartedAt: number;
  deadlineAt: number | null;
  storylines: ServerPhoneStoryline[];
  inactiveReasons: Record<
    string,
    "left" | "kicked" | "disconnected"
  >;
  summaryCursor: { storyIndex: number; entryIndex: number } | null;
  completedAt: number | null;
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
  phoneMatch: ServerPhoneMatch | null;
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

export interface PhoneDrawingBatchCommand {
  idempotencyId: string;
  assignmentId: string;
  strokeId: string;
  chunkId: number;
  operations: DrawingOp[];
}
