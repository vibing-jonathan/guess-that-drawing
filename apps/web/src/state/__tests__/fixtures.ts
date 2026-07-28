import {
  DEFAULT_AVATAR,
  DEFAULT_ROOM_SETTINGS,
  type AckEnvelope,
  type DrawingEnvelope,
  type PlayerPublic,
  type PlayerRoomSnapshot,
  type ReplayState,
  type RoomPhase,
  type RoundPrivate,
  type SessionEstablished,
} from "@gtd/contracts";

export function makePlayer(
  id: string,
  overrides: Partial<PlayerPublic> = {},
): PlayerPublic {
  return {
    id,
    name: id === "player-1" ? "Maya" : "Noah",
    avatar: DEFAULT_AVATAR,
    score: 0,
    isHost: id === "player-1",
    isConnected: true,
    hasGuessed: false,
    isDrawing: false,
    joinedAt: id === "player-1" ? 1_000 : 2_000,
    joinOrder: id === "player-1" ? 0 : 1,
    disconnectedUntil: null,
    ...overrides,
  };
}

interface SnapshotOptions {
  revision?: number;
  selfPlayerId?: string;
  phase?: RoomPhase;
  turnId?: string;
  drawerId?: string;
  privateRound?: RoundPrivate | null;
  drawing?: ReplayState | null;
  chat?: PlayerRoomSnapshot["chat"];
  players?: PlayerPublic[];
}

export function makeSnapshot(
  options: SnapshotOptions = {},
): PlayerRoomSnapshot {
  const revision = options.revision ?? 1;
  const phase = options.phase ?? "drawing";
  const turnId = options.turnId ?? "turn-1";
  const drawerId = options.drawerId ?? "player-1";
  const hasRound = phase !== "lobby" && phase !== "final-results";
  const players =
    options.players ??
    [
      makePlayer("player-1", {
        isDrawing: drawerId === "player-1" && hasRound,
      }),
      makePlayer("player-2", {
        isDrawing: drawerId === "player-2" && hasRound,
      }),
    ];

  return {
    code: "ABC234",
    revision,
    phase,
    settings: DEFAULT_ROOM_SETTINGS,
    players,
    round: hasRound
      ? {
          turnId,
          phase:
            phase === "selecting" ||
            phase === "drawing" ||
            phase === "turn-results"
              ? phase
              : "drawing",
          drawerId,
          cycle: 1,
          cycleCount: 2,
          turn: 1,
          turnCount: 2,
          wordMask:
            phase === "drawing"
              ? { pattern: "______", letters: 6, words: 1 }
              : null,
          selectionDeadline:
            phase === "selecting" ? 50_000 : null,
          drawingDeadline: phase === "drawing" ? 80_000 : null,
          pausedUntil: null,
          guessedPlayerIds: [],
          correctGuessCount: 0,
        }
      : null,
    drawing:
      options.drawing === undefined
        ? hasRound
          ? {
              revision,
              turnId,
              fromSequence: 0,
              throughSequence: 0,
              operations: [],
            }
          : null
        : options.drawing,
    chat: options.chat ?? [],
    serverTime: 10_000,
    createdAt: 1_000,
    expiresAt: 500_000,
    selfPlayerId: options.selfPlayerId ?? "player-2",
    privateRound: options.privateRound ?? null,
  };
}

export function makeEnvelope(
  serverSequence: number,
  turnId = "turn-1",
): DrawingEnvelope {
  return {
    turnId,
    strokeId: `stroke-${serverSequence}`,
    chunkId: 0,
    serverSequence,
    operation: {
      kind: "clear",
      opId: `op-${serverSequence}`,
    },
  };
}

export function makeEstablished(
  snapshot: PlayerRoomSnapshot = makeSnapshot(),
  recovered = false,
): SessionEstablished {
  return {
    credentials: {
      playerId: snapshot.selfPlayerId,
      reconnectToken: "reconnect-token-long-enough",
    },
    snapshot,
    recovered,
  };
}

export function ackSuccess<Value>(
  data: Value,
  revision?: number,
): AckEnvelope<Value> {
  return {
    ok: true,
    data,
    meta:
      revision === undefined
        ? { serverTime: 10_000 }
        : { serverTime: 10_000, revision },
  };
}

export function ackFailure(
  code: "ROOM_FULL" | "SERVER_UNAVAILABLE",
  message = "Request failed.",
): AckEnvelope<never> {
  return {
    ok: false,
    error: {
      code,
      message,
      retryable: code === "SERVER_UNAVAILABLE",
    },
    meta: { serverTime: 10_000 },
  };
}
