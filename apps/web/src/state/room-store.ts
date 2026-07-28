import type {
  ChatMessageEvent,
  ConnectionStateEvent,
  ContractError,
  CorrectGuessBroadcast,
  CorrectGuessEvent,
  DrawingBroadcast,
  DrawingEnvelope,
  DrawingResetEvent,
  GuessFeedback,
  GuessFeedbackEvent,
  HostTransferredEvent,
  KickedEvent,
  MatchFinishedEvent,
  PlayerEvent,
  PlayerLeftEvent,
  PlayerRoomSnapshot,
  ReplayState,
  RoomSnapshot,
  RoundEvent,
  RoundPrivate,
  RoundPrivateEvent,
  ScoreUpdatedEvent,
  SessionCredentials,
  SessionEstablished,
  SettingsUpdatedEvent,
  TurnEndedEvent,
  TurnResult,
} from "@gtd/contracts";
import { useStore } from "zustand";
import { createStore, type StoreApi } from "zustand/vanilla";

const MAX_PRIVATE_FEEDBACK = 20;
const MAX_CORRECT_GUESS_EVENTS = 24;
const MAX_CHAT_MESSAGES = 200;

export type RoomConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "recovering"
  | "offline"
  | "outage";

export type RoomSessionStatus =
  | "none"
  | "creating"
  | "joining"
  | "resuming"
  | "in-room"
  | "leaving"
  | "kicked";

export type RoomSyncStatus =
  | "idle"
  | "synced"
  | "desynced"
  | "resyncing";

export type DrawingSyncStatus = "idle" | "synced" | "gap" | "replaying";

export type EventApplyResult =
  | "applied"
  | "stale"
  | "gap"
  | "drawing-gap"
  | "ignored";

export interface StoredRoomSession {
  roomCode: string;
  credentials: SessionCredentials;
}

export interface RealtimeClientIssue {
  code: string;
  message: string;
  retryable: boolean;
  details: Readonly<Record<string, unknown>> | null;
}

interface RevisionGap {
  expected: number;
  received: number;
}

interface RoomStoreData {
  connectionStatus: RoomConnectionStatus;
  connectionMessage: string | null;
  sessionStatus: RoomSessionStatus;
  syncStatus: RoomSyncStatus;
  drawingSyncStatus: DrawingSyncStatus;
  pendingRequests: number;
  serverClockOffsetMs: number;
  session: StoredRoomSession | null;
  room: PlayerRoomSnapshot | null;
  lastSnapshotRevision: number | null;
  revisionGap: RevisionGap | null;
  drawingGapAfterSequence: number | null;
  eventRevisions: Readonly<Record<string, number>>;
  privateFeedback: readonly GuessFeedback[];
  latestGuessFeedback: GuessFeedback | null;
  correctGuessEvents: readonly CorrectGuessEvent[];
  lastTurnResult: TurnResult | null;
  lastError: RealtimeClientIssue | null;
  kickedReason: string | null;
}

export interface RoomStoreActions {
  setConnection: (
    status: RoomConnectionStatus,
    message?: string | null,
  ) => void;
  applyConnectionEvent: (event: ConnectionStateEvent) => void;
  setSessionStatus: (status: RoomSessionStatus) => void;
  beginRequest: () => void;
  endRequest: () => void;
  syncServerTime: (serverTime: number) => void;
  setSession: (session: StoredRoomSession | null) => void;
  acknowledgeRevision: (revision: number) => EventApplyResult;
  establishSession: (session: SessionEstablished) => EventApplyResult;
  applySnapshot: (snapshot: PlayerRoomSnapshot) => EventApplyResult;
  beginResync: () => void;
  markDesynced: (expected: number, received: number) => void;
  beginDrawingReplay: (afterSequence: number) => void;
  markDrawingGap: (afterSequence: number) => void;
  applyReplay: (replay: ReplayState) => EventApplyResult;
  applyPlayerJoined: (event: PlayerEvent) => EventApplyResult;
  applyPlayerUpdated: (event: PlayerEvent) => EventApplyResult;
  applyPlayerLeft: (event: PlayerLeftEvent) => EventApplyResult;
  applyHostTransferred: (
    event: HostTransferredEvent,
  ) => EventApplyResult;
  applySettingsUpdated: (
    event: SettingsUpdatedEvent,
  ) => EventApplyResult;
  applyRoundEvent: (event: RoundEvent) => EventApplyResult;
  applyPrivateRound: (event: RoundPrivateEvent) => EventApplyResult;
  applyTurnEnded: (event: TurnEndedEvent) => EventApplyResult;
  applyMatchFinished: (event: MatchFinishedEvent) => EventApplyResult;
  applyDrawingBatch: (event: DrawingBroadcast) => EventApplyResult;
  applyDrawingReset: (event: DrawingResetEvent) => EventApplyResult;
  applyChatMessage: (event: ChatMessageEvent) => EventApplyResult;
  applyGuessFeedback: (event: GuessFeedbackEvent) => EventApplyResult;
  applyCorrectGuess: (
    event: CorrectGuessBroadcast,
  ) => EventApplyResult;
  applyScoreUpdated: (event: ScoreUpdatedEvent) => EventApplyResult;
  applyKicked: (event: KickedEvent) => EventApplyResult;
  setError: (error: RealtimeClientIssue | ContractError | null) => void;
  clearRoom: (status?: RoomSessionStatus) => void;
  reset: () => void;
}

export type RoomStoreState = RoomStoreData & RoomStoreActions;
export type RoomStoreApi = StoreApi<RoomStoreState>;

const initialData = (): RoomStoreData => ({
  connectionStatus: "idle",
  connectionMessage: null,
  sessionStatus: "none",
  syncStatus: "idle",
  drawingSyncStatus: "idle",
  pendingRequests: 0,
  serverClockOffsetMs: 0,
  session: null,
  room: null,
  lastSnapshotRevision: null,
  revisionGap: null,
  drawingGapAfterSequence: null,
  eventRevisions: {},
  privateFeedback: [],
  latestGuessFeedback: null,
  correctGuessEvents: [],
  lastTurnResult: null,
  lastError: null,
  kickedReason: null,
});

function sanitizePrivateRound(
  snapshot: PlayerRoomSnapshot,
): RoundPrivate | null {
  const privateRound = snapshot.privateRound;
  if (
    !privateRound ||
    !snapshot.round ||
    snapshot.round.turnId !== privateRound.turnId ||
    snapshot.round.drawerId !== snapshot.selfPlayerId ||
    !snapshot.players.some(
      (player) => player.id === snapshot.selfPlayerId,
    )
  ) {
    return null;
  }
  return privateRound;
}

function sanitizeSnapshot(
  snapshot: PlayerRoomSnapshot,
): PlayerRoomSnapshot {
  return {
    ...snapshot,
    players: [...snapshot.players],
    chat: [...snapshot.chat],
    drawing: snapshot.drawing
      ? {
          ...snapshot.drawing,
          operations: [...snapshot.drawing.operations],
        }
      : null,
    round: snapshot.round
      ? {
          ...snapshot.round,
          guessedPlayerIds: [...snapshot.round.guessedPlayerIds],
        }
      : null,
    privateRound: sanitizePrivateRound(snapshot),
  };
}

function publicToPlayerSnapshot(
  snapshot: RoomSnapshot,
  selfPlayerId: string,
): PlayerRoomSnapshot {
  return sanitizeSnapshot({
    ...snapshot,
    selfPlayerId,
    privateRound: null,
  });
}

function contractIssue(error: RealtimeClientIssue | ContractError) {
  return {
    code: error.code,
    message: error.message,
    retryable: error.retryable,
    details: error.details ?? null,
  } satisfies RealtimeClientIssue;
}

function drawingThroughSequence(room: PlayerRoomSnapshot | null): number {
  return room?.drawing?.throughSequence ?? 0;
}

function isContiguous(
  envelopes: readonly DrawingEnvelope[],
  afterSequence: number,
): boolean {
  let expected = afterSequence + 1;
  for (const envelope of envelopes) {
    if (envelope.serverSequence !== expected) {
      return false;
    }
    expected += 1;
  }
  return true;
}

function mergeDrawingReplay(
  room: PlayerRoomSnapshot,
  replay: ReplayState,
): PlayerRoomSnapshot | null {
  if (room.round?.turnId !== replay.turnId) {
    return null;
  }

  const existing =
    room.drawing?.turnId === replay.turnId ? room.drawing : null;
  const throughSequence = existing?.throughSequence ?? 0;
  const additions = replay.operations
    .filter((envelope) => envelope.serverSequence > throughSequence)
    .sort((left, right) => left.serverSequence - right.serverSequence);

  if (!isContiguous(additions, throughSequence)) {
    return null;
  }
  if (
    additions.length === 0 &&
    replay.throughSequence > throughSequence
  ) {
    return null;
  }

  const operations = [...(existing?.operations ?? []), ...additions];
  const nextThrough =
    additions.at(-1)?.serverSequence ??
    Math.max(throughSequence, replay.throughSequence);
  if (replay.throughSequence > nextThrough) {
    return null;
  }

  return {
    ...room,
    drawing: {
      revision: Math.max(existing?.revision ?? 0, replay.revision),
      turnId: replay.turnId,
      fromSequence: operations[0]?.serverSequence ?? replay.fromSequence,
      throughSequence: nextThrough,
      operations,
    },
  };
}

export function createRoomStore(): RoomStoreApi {
  return createStore<RoomStoreState>()((set, get) => {
    const assessRevision = (
      revision: number,
      eventKey: string,
    ): EventApplyResult => {
      const state = get();
      if (!state.room) {
        return "ignored";
      }
      const currentRevision = state.room.revision;
      if (revision < currentRevision) {
        return "stale";
      }
      if (
        state.syncStatus === "desynced" ||
        state.syncStatus === "resyncing"
      ) {
        if (revision <= currentRevision) {
          return "stale";
        }
        return "gap";
      }
      if (revision > currentRevision + 1) {
        set({
          syncStatus: "desynced",
          revisionGap: {
            expected: currentRevision + 1,
            received: revision,
          },
        });
        return "gap";
      }
      if (state.eventRevisions[eventKey] === revision) {
        return "stale";
      }
      return "applied";
    };

    const recordEvent = (eventKey: string, revision: number) => {
      const state = get();
      set({
        eventRevisions: {
          ...state.eventRevisions,
          [eventKey]: revision,
        },
      });
    };

    const applyRoomDelta = (
      revision: number,
      eventKey: string,
      update: (room: PlayerRoomSnapshot) => PlayerRoomSnapshot,
    ): EventApplyResult => {
      const result = assessRevision(revision, eventKey);
      if (result !== "applied") {
        return result;
      }
      const room = get().room;
      if (!room) {
        return "ignored";
      }
      set({
        room: {
          ...update(room),
          revision: Math.max(room.revision, revision),
        },
      });
      recordEvent(eventKey, revision);
      return "applied";
    };

    return {
      ...initialData(),

      setConnection: (connectionStatus, connectionMessage = null) => {
        set({ connectionStatus, connectionMessage });
      },

      applyConnectionEvent: (event) => {
        const status: RoomConnectionStatus =
          event.state === "offline"
            ? "offline"
            : event.state === "recovering"
              ? "recovering"
              : "connected";
        set({
          connectionStatus: status,
          connectionMessage: event.message ?? null,
        });
      },

      setSessionStatus: (sessionStatus) => {
        set({ sessionStatus });
      },

      beginRequest: () => {
        set((state) => ({
          pendingRequests: state.pendingRequests + 1,
          lastError: null,
        }));
      },

      endRequest: () => {
        set((state) => ({
          pendingRequests: Math.max(0, state.pendingRequests - 1),
        }));
      },

      syncServerTime: (serverTime) => {
        set({ serverClockOffsetMs: serverTime - Date.now() });
      },

      setSession: (session) => {
        set({ session });
      },

      acknowledgeRevision: (revision) => {
        const state = get();
        if (!state.room) {
          return "ignored";
        }
        if (revision <= state.room.revision) {
          return "stale";
        }
        if (revision !== state.room.revision + 1) {
          set({
            syncStatus: "desynced",
            revisionGap: {
              expected: state.room.revision + 1,
              received: revision,
            },
          });
          return "gap";
        }
        set({
          room: {
            ...state.room,
            revision,
          },
        });
        return "applied";
      },

      establishSession: (session) => {
        const snapshot = sanitizeSnapshot(session.snapshot);
        if (
          session.credentials.playerId !== snapshot.selfPlayerId ||
          !snapshot.players.some(
            (player) => player.id === snapshot.selfPlayerId,
          )
        ) {
          return "ignored";
        }
        set({
          session: {
            roomCode: snapshot.code,
            credentials: session.credentials,
          },
          room: snapshot,
          serverClockOffsetMs: snapshot.serverTime - Date.now(),
          sessionStatus: "in-room",
          syncStatus: "synced",
          drawingSyncStatus: "synced",
          lastSnapshotRevision: snapshot.revision,
          revisionGap: null,
          drawingGapAfterSequence: null,
          eventRevisions: {},
          privateFeedback: [],
          latestGuessFeedback: null,
          correctGuessEvents: [],
          lastTurnResult: null,
          lastError: null,
          kickedReason: null,
        });
        return "applied";
      },

      applySnapshot: (incoming) => {
        const state = get();
        if (
          state.room &&
          (incoming.code !== state.room.code ||
            incoming.selfPlayerId !== state.room.selfPlayerId)
        ) {
          return "ignored";
        }
        if (state.room && incoming.revision < state.room.revision) {
          return "stale";
        }

        const snapshot = sanitizeSnapshot(incoming);
        const sameTurn =
          state.room?.round?.turnId !== undefined &&
          state.room.round.turnId === snapshot.round?.turnId;
        set({
          room: snapshot,
          serverClockOffsetMs: snapshot.serverTime - Date.now(),
          sessionStatus: "in-room",
          syncStatus: "synced",
          drawingSyncStatus: "synced",
          lastSnapshotRevision: snapshot.revision,
          revisionGap: null,
          drawingGapAfterSequence: null,
          eventRevisions: {},
          privateFeedback: sameTurn ? state.privateFeedback : [],
          latestGuessFeedback: sameTurn
            ? state.latestGuessFeedback
            : null,
          correctGuessEvents: sameTurn
            ? state.correctGuessEvents
            : [],
          lastTurnResult:
            snapshot.phase === "turn-results"
              ? state.lastTurnResult
              : null,
        });
        return "applied";
      },

      beginResync: () => {
        if (get().room) {
          set({ syncStatus: "resyncing" });
        }
      },

      markDesynced: (expected, received) => {
        if (get().room) {
          set({
            syncStatus: "desynced",
            revisionGap: { expected, received },
          });
        }
      },

      beginDrawingReplay: (afterSequence) => {
        set({
          drawingSyncStatus: "replaying",
          drawingGapAfterSequence: afterSequence,
        });
      },

      markDrawingGap: (afterSequence) => {
        set({
          drawingSyncStatus: "gap",
          drawingGapAfterSequence: afterSequence,
        });
      },

      applyReplay: (replay) => {
        const state = get();
        if (!state.room || state.room.round?.turnId !== replay.turnId) {
          return "ignored";
        }
        const merged = mergeDrawingReplay(state.room, replay);
        if (!merged) {
          set({
            drawingSyncStatus: "gap",
            drawingGapAfterSequence: drawingThroughSequence(state.room),
          });
          return "drawing-gap";
        }
        set({
          room: merged,
          drawingSyncStatus: "synced",
          drawingGapAfterSequence: null,
        });
        return "applied";
      },

      applyPlayerJoined: (event) =>
        applyRoomDelta(
          event.revision,
          `player-joined:${event.player.id}`,
          (room) => {
            const players = room.players.some(
              (player) => player.id === event.player.id,
            )
              ? room.players.map((player) =>
                  player.id === event.player.id ? event.player : player,
                )
              : [...room.players, event.player];
            return {
              ...room,
              players: players.sort(
                (left, right) => left.joinOrder - right.joinOrder,
              ),
            };
          },
        ),

      applyPlayerUpdated: (event) =>
        applyRoomDelta(
          event.revision,
          `player-updated:${event.player.id}`,
          (room) => ({
            ...room,
            players: room.players.map((player) =>
              player.id === event.player.id ? event.player : player,
            ),
          }),
        ),

      applyPlayerLeft: (event) =>
        applyRoomDelta(
          event.revision,
          `player-left:${event.playerId}`,
          (room) => ({
            ...room,
            players:
              event.reason === "disconnected"
                ? room.players.map((player) =>
                    player.id === event.playerId
                      ? {
                          ...player,
                          isConnected: false,
                          disconnectedUntil: event.reconnectDeadline,
                        }
                      : player,
                  )
                : room.players.filter(
                    (player) => player.id !== event.playerId,
                  ),
          }),
        ),

      applyHostTransferred: (event) =>
        applyRoomDelta(
          event.revision,
          `host-transferred:${event.hostId}`,
          (room) => ({
            ...room,
            players: room.players.map((player) => ({
              ...player,
              isHost: player.id === event.hostId,
            })),
          }),
        ),

      applySettingsUpdated: (event) =>
        applyRoomDelta(event.revision, "settings-updated", (room) => ({
          ...room,
          settings: event.settings,
        })),

      applyRoundEvent: (event) =>
        applyRoomDelta(
          event.revision,
          `round:${event.round.phase}:${event.round.turnId}`,
          (room) => {
            const sameTurn = room.round?.turnId === event.round.turnId;
            const isDrawer =
              event.round.drawerId === room.selfPlayerId;
            const state = get();
            if (!sameTurn) {
              set({
                privateFeedback: [],
                latestGuessFeedback: null,
                correctGuessEvents: [],
                lastTurnResult: null,
                drawingSyncStatus: "synced",
                drawingGapAfterSequence: null,
              });
            }
            return {
              ...room,
              phase: event.round.phase,
              round: {
                ...event.round,
                guessedPlayerIds: [...event.round.guessedPlayerIds],
              },
              drawing: sameTurn ? room.drawing : null,
              privateRound:
                sameTurn && isDrawer ? room.privateRound : null,
              players: room.players.map((player) => ({
                ...player,
                isDrawing: player.id === event.round.drawerId,
                hasGuessed: event.round.guessedPlayerIds.includes(
                  player.id,
                ),
              })),
              chat: room.chat,
              revision: Math.max(room.revision, event.revision),
              serverTime: state.room?.serverTime ?? room.serverTime,
            };
          },
        ),

      applyPrivateRound: (event) => {
        const room = get().room;
        if (
          !room ||
          room.selfPlayerId !== room.round?.drawerId ||
          room.round.turnId !== event.privateRound.turnId
        ) {
          return "ignored";
        }
        return applyRoomDelta(
          event.revision,
          `round-private:${event.privateRound.turnId}`,
          (current) => ({
            ...current,
            privateRound: event.privateRound,
          }),
        );
      },

      applyTurnEnded: (event) => {
        const state = get();
        if (!state.room || event.revision < state.room.revision) {
          return state.room ? "stale" : "ignored";
        }
        if (event.snapshot.revision !== event.revision) {
          set({
            syncStatus: "desynced",
            revisionGap: {
              expected: state.room.revision + 1,
              received: event.revision,
            },
          });
          return "gap";
        }
        const snapshot = publicToPlayerSnapshot(
          event.snapshot,
          state.room.selfPlayerId,
        );
        set({
          room: snapshot,
          syncStatus: "synced",
          drawingSyncStatus: "synced",
          lastSnapshotRevision: event.revision,
          revisionGap: null,
          drawingGapAfterSequence: null,
          eventRevisions: {
            ...state.eventRevisions,
            [`round-ended:${event.result.turnId}`]: event.revision,
          },
          lastTurnResult: event.result,
        });
        return "applied";
      },

      applyMatchFinished: (event) => {
        const result = get().applySnapshot(event.snapshot);
        if (result === "applied") {
          set({
            privateFeedback: [],
            latestGuessFeedback: null,
            correctGuessEvents: [],
          });
        }
        return result;
      },

      applyDrawingBatch: (event) => {
        const eventKey = `drawing:${event.envelopes.at(-1)?.serverSequence ?? "empty"}`;
        const revisionResult = assessRevision(event.revision, eventKey);
        if (revisionResult !== "applied") {
          return revisionResult;
        }
        const room = get().room;
        if (!room?.round || event.envelopes.length === 0) {
          return "ignored";
        }
        if (
          event.envelopes.some(
            (envelope) => envelope.turnId !== room.round?.turnId,
          )
        ) {
          return "ignored";
        }

        const throughSequence = drawingThroughSequence(room);
        const additions = event.envelopes.filter(
          (envelope) => envelope.serverSequence > throughSequence,
        );
        if (!isContiguous(additions, throughSequence)) {
          set({
            drawingSyncStatus: "gap",
            drawingGapAfterSequence: throughSequence,
            room: {
              ...room,
              revision: Math.max(room.revision, event.revision),
            },
          });
          recordEvent(eventKey, event.revision);
          return "drawing-gap";
        }

        const currentDrawing =
          room.drawing?.turnId === room.round.turnId
            ? room.drawing
            : null;
        const operations = [
          ...(currentDrawing?.operations ?? []),
          ...additions,
        ];
        set({
          room: {
            ...room,
            revision: Math.max(room.revision, event.revision),
            drawing: {
              revision: event.revision,
              turnId: room.round.turnId,
              fromSequence: operations[0]?.serverSequence ?? 0,
              throughSequence:
                operations.at(-1)?.serverSequence ?? throughSequence,
              operations,
            },
          },
          drawingSyncStatus: "synced",
          drawingGapAfterSequence: null,
        });
        recordEvent(eventKey, event.revision);
        return "applied";
      },

      applyDrawingReset: (event) => {
        if (get().room?.round?.turnId !== event.turnId) {
          return "ignored";
        }
        return applyRoomDelta(
          event.revision,
          `drawing-reset:${event.turnId}:${event.throughSequence}`,
          (room) => {
            set({
              drawingSyncStatus: "synced",
              drawingGapAfterSequence: null,
            });
            return {
              ...room,
              drawing: {
                revision: event.revision,
                turnId: event.turnId,
                fromSequence: event.throughSequence,
                throughSequence: event.throughSequence,
                operations: [],
              },
            };
          },
        );
      },

      applyChatMessage: (event) =>
        applyRoomDelta(
          event.revision,
          `chat:${event.message.id}`,
          (room) => ({
            ...room,
            chat: room.chat.some(
              (message) => message.id === event.message.id,
            )
              ? room.chat
              : [...room.chat, event.message].slice(-MAX_CHAT_MESSAGES),
          }),
        ),

      applyGuessFeedback: (event) => {
        const room = get().room;
        if (
          !room?.round ||
          room.round.turnId !== event.feedback.turnId ||
          room.round.drawerId === room.selfPlayerId
        ) {
          return "ignored";
        }
        const result = assessRevision(
          event.revision,
          `guess-feedback:${event.feedbackId}`,
        );
        if (result !== "applied") {
          return result;
        }
        const feedback = [
          ...get().privateFeedback,
          event.feedback,
        ].slice(-MAX_PRIVATE_FEEDBACK);
        set({
          room: {
            ...room,
            revision: Math.max(room.revision, event.revision),
          },
          privateFeedback: feedback,
          latestGuessFeedback: event.feedback,
        });
        recordEvent(
          `guess-feedback:${event.feedbackId}`,
          event.revision,
        );
        return "applied";
      },

      applyCorrectGuess: (event) => {
        if (get().room?.round?.turnId !== event.guess.turnId) {
          return "ignored";
        }
        return applyRoomDelta(
          event.revision,
          `correct:${event.guess.turnId}:${event.guess.playerId}`,
          (room) => {
            const round = room.round;
            if (!round || round.turnId !== event.guess.turnId) {
              return room;
            }
            const alreadyRecorded = get().correctGuessEvents.some(
              (guess) =>
                guess.turnId === event.guess.turnId &&
                guess.playerId === event.guess.playerId,
            );
            if (!alreadyRecorded) {
              set({
                correctGuessEvents: [
                  ...get().correctGuessEvents,
                  event.guess,
                ].slice(-MAX_CORRECT_GUESS_EVENTS),
              });
            }
            const guessedPlayerIds = round.guessedPlayerIds.includes(
              event.guess.playerId,
            )
              ? round.guessedPlayerIds
              : [
                  ...round.guessedPlayerIds,
                  event.guess.playerId,
                ];
            return {
              ...room,
              round: {
                ...round,
                guessedPlayerIds,
                correctGuessCount: Math.max(
                  round.correctGuessCount,
                  guessedPlayerIds.length,
                ),
              },
              players: room.players.map((player) =>
                player.id === event.guess.playerId
                  ? { ...player, hasGuessed: true }
                  : player,
              ),
            };
          },
        );
      },

      applyScoreUpdated: (event) =>
        applyRoomDelta(
          event.revision,
          `score:${event.changes
            .map((change) => change.playerId)
            .sort()
            .join(",")}`,
          (room) => {
            const totals = new Map(
              event.changes.map((change) => [
                change.playerId,
                change.total,
              ]),
            );
            return {
              ...room,
              players: room.players.map((player) => {
                const score = totals.get(player.id);
                return score === undefined
                  ? player
                  : { ...player, score };
              }),
            };
          },
        ),

      applyKicked: (event) => {
        const room = get().room;
        if (room && event.revision < room.revision) {
          return "stale";
        }
        set({
          ...initialData(),
          connectionStatus: get().connectionStatus,
          connectionMessage: get().connectionMessage,
          sessionStatus: "kicked",
          kickedReason: event.reason,
          lastError: {
            code: event.code,
            message: event.reason,
            retryable: false,
            details: null,
          },
        });
        return "applied";
      },

      setError: (error) => {
        set({ lastError: error ? contractIssue(error) : null });
      },

      clearRoom: (sessionStatus = "none") => {
        const state = get();
        set({
          ...initialData(),
          connectionStatus: state.connectionStatus,
          connectionMessage: state.connectionMessage,
          sessionStatus,
        });
      },

      reset: () => {
        set(initialData());
      },
    };
  });
}

export const roomStore = createRoomStore();

export function useRoomStore<Selection>(
  selector: (state: RoomStoreState) => Selection,
): Selection {
  return useStore(roomStore, selector);
}

export const selectCurrentPlayer = (state: RoomStoreState) =>
  state.room?.players.find(
    (player) => player.id === state.room?.selfPlayerId,
  ) ?? null;

export const selectIsDrawer = (state: RoomStoreState) =>
  state.room?.round?.drawerId === state.room?.selfPlayerId;

export const selectIsHost = (state: RoomStoreState) =>
  selectCurrentPlayer(state)?.isHost ?? false;

export const selectLastDrawingSequence = (state: RoomStoreState) =>
  drawingThroughSequence(state.room);
