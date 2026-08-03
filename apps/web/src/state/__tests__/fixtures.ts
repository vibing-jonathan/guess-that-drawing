import {
  DEFAULT_AVATAR,
  DEFAULT_PHONE_ROOM_SETTINGS,
  DEFAULT_ROOM_SETTINGS,
  type AckEnvelope,
  type ClassicPlayerRoomSnapshot,
  type ClassicRoomPhase,
  type DrawingEnvelope,
  type PhoneActivePhase,
  type PhoneDrawingDraft,
  type PhoneDrawingEnvelope,
  type PhonePrompt,
  type PlayerPublic,
  type PlayerRoomSnapshot,
  type ReplayState,
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
  phase?: ClassicRoomPhase;
  turnId?: string;
  drawerId?: string;
  privateRound?: RoundPrivate | null;
  drawing?: ReplayState | null;
  chat?: PlayerRoomSnapshot["chat"];
  players?: PlayerPublic[];
}

export function makeSnapshot(
  options: SnapshotOptions = {},
): ClassicPlayerRoomSnapshot {
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
    mode: "classic",
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

export type PhoneActiveSnapshot = Extract<
  PlayerRoomSnapshot,
  { mode: "phone"; phone: { deadline: number } }
>;

export function makePhoneWritingSnapshot(
  overrides: Partial<PhoneActiveSnapshot> = {},
): PhoneActiveSnapshot {
  const players = [
    makePlayer("player-1", { name: "Maya", joinOrder: 0 }),
    makePlayer("player-2", {
      name: "Noah",
      joinOrder: 1,
      isHost: false,
    }),
    makePlayer("player-3", {
      name: "Priya",
      joinOrder: 2,
      isHost: false,
    }),
    makePlayer("player-4", {
      name: "Leo",
      joinOrder: 3,
      isHost: false,
    }),
  ];
  const base: PhoneActiveSnapshot = {
    mode: "phone",
    code: "ABC234",
    revision: 1,
    phase: "phone-writing",
    settings: DEFAULT_PHONE_ROOM_SETTINGS,
    players,
    round: null,
    drawing: null,
    phone: {
      matchId: "phone-match-1",
      phase: "phone-writing",
      deadline: 70_000,
      submittedCount: 0,
      totalCount: players.length,
      participants: players.map((player) => ({
        playerId: player.id,
        playerName: player.name,
        avatar: player.avatar,
        status: "working",
      })),
    },
    chat: [],
    serverTime: 10_000,
    createdAt: 1_000,
    expiresAt: 500_000,
    selfPlayerId: "player-2",
    privatePhone: {
      matchId: "phone-match-1",
      phase: "phone-writing",
      assignmentId: "assignment-1",
      prompt: null,
      skippedEntryCount: 0,
      draft: null,
      submitted: false,
    },
  };
  return { ...base, ...overrides };
}

export function makePhoneDrawingEnvelope(
  serverSequence = 1,
  assignmentId = "assignment-1",
): PhoneDrawingEnvelope {
  return {
    assignmentId,
    strokeId: `phone-stroke-${serverSequence}`,
    chunkId: 0,
    serverSequence,
    operation: {
      kind: "shape",
      opId: `phone-op-${serverSequence}`,
      shape: "line",
      style: {
        color: "#112244",
        size: 6,
        fill: false,
      },
      start: { x: 120, y: 90 },
      end: { x: 520, y: 360 },
    },
  };
}

export function makePhonePhaseSnapshot(
  phase: PhoneActivePhase,
  options: {
    prompt?: PhonePrompt | null;
    draft?: PhoneDrawingDraft | null;
    submitted?: boolean;
    skippedEntryCount?: number;
    selfPlayerId?: string;
  } = {},
): PhoneActiveSnapshot {
  const base = makePhoneWritingSnapshot();
  if (!base.privatePhone) {
    throw new Error("Expected the Phone fixture to include private state.");
  }
  return {
    ...base,
    phase,
    selfPlayerId: options.selfPlayerId ?? base.selfPlayerId,
    phone: {
      ...base.phone,
      phase,
    },
    privatePhone: {
      ...base.privatePhone,
      phase,
      prompt: options.prompt ?? null,
      draft: options.draft ?? null,
      submitted: options.submitted ?? false,
      skippedEntryCount: options.skippedEntryCount ?? 0,
    },
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
